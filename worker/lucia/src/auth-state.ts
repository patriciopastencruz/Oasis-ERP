import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
} from "baileys";

/**
 * Sesión de WhatsApp guardada en Supabase (tabla lucia_wa_auth), para que un
 * reinicio o redeploy del worker no obligue a escanear el QR otra vez.
 * Mismo formato que useMultiFileAuthState de Baileys, pero en la base.
 */
export async function loadSupabaseAuthState(admin: SupabaseClient, companyId: string) {
  const table = () => admin.from("lucia_wa_auth");

  const read = async (key: string) => {
    const { data, error } = await table()
      .select("value")
      .eq("company_id", companyId)
      .eq("key", key)
      .maybeSingle();
    if (error) throw new Error(`No se pudo leer la sesión (${key}): ${error.message}`);
    return data ? JSON.parse(JSON.stringify(data.value), BufferJSON.reviver) : null;
  };

  const write = async (entries: { key: string; value: unknown }[]) => {
    if (!entries.length) return;
    const { error } = await table().upsert(
      entries.map((e) => ({
        company_id: companyId,
        key: e.key,
        value: JSON.parse(JSON.stringify(e.value, BufferJSON.replacer)),
        updated_at: new Date().toISOString(),
      })),
    );
    if (error) throw new Error(`No se pudo guardar la sesión: ${error.message}`);
  };

  const remove = async (keys: string[]) => {
    if (!keys.length) return;
    const { error } = await table().delete().eq("company_id", companyId).in("key", keys);
    if (error) throw new Error(`No se pudo borrar parte de la sesión: ${error.message}`);
  };

  const creds: AuthenticationCreds = (await read("creds")) ?? initAuthCreds();

  const state: AuthenticationState = {
    creds,
    keys: {
      get: async (type, ids) => {
        const result: { [id: string]: SignalDataTypeMap[typeof type] } = {};
        if (!ids.length) return result;
        const { data, error } = await table()
          .select("key,value")
          .eq("company_id", companyId)
          .in(
            "key",
            ids.map((id) => `${type}-${id}`),
          );
        if (error) throw new Error(`No se pudieron leer las llaves: ${error.message}`);
        for (const row of data ?? []) {
          const id = row.key.slice(type.length + 1);
          let value = JSON.parse(JSON.stringify(row.value), BufferJSON.reviver);
          if (type === "app-state-sync-key" && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(value);
          }
          result[id] = value;
        }
        return result;
      },
      set: async (data) => {
        const upserts: { key: string; value: unknown }[] = [];
        const deletes: string[] = [];
        for (const category of Object.keys(data) as (keyof SignalDataTypeMap)[]) {
          for (const [id, value] of Object.entries(data[category] ?? {})) {
            const key = `${category}-${id}`;
            if (value) upserts.push({ key, value });
            else deletes.push(key);
          }
        }
        await Promise.all([write(upserts), remove(deletes)]);
      },
    },
  };

  return {
    state,
    saveCreds: () => write([{ key: "creds", value: creds }]),
    /** Borra toda la sesión (al cerrar sesión desde el teléfono). */
    clear: async () => {
      const { error } = await table().delete().eq("company_id", companyId);
      if (error) throw new Error(`No se pudo borrar la sesión: ${error.message}`);
    },
  };
}
