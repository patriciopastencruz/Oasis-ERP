import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
}
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,secret=process.env.SUPABASE_SECRET_KEY;
if(!url||!secret) throw new Error("Faltan variables de Supabase en .env.local");
const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const categories=[
  ["ADMIN","Administración","Gastos administrativos y de gestión general."],
  ["MAINT","Mantención","Reparaciones, mantenimiento preventivo y correctivo."],
  ["UTILITIES","Servicios básicos","Electricidad, agua, gas, internet y servicios similares."],
  ["SUPPLIES","Insumos y materiales","Compra de insumos, materiales y suministros operacionales."],
  ["LOGISTICS","Transporte y logística","Fletes, traslados, transporte y servicios logísticos."],
  ["FOOD","Alimentación","Alimentación, colaciones y gastos relacionados."],
  ["LODGING","Alojamiento","Hospedaje y alojamiento de trabajadores o terceros."],
  ["PROF_SERVICES","Honorarios y servicios profesionales","Servicios profesionales, asesorías y honorarios."],
  ["OPS_PURCHASES","Compras operacionales","Compras necesarias para la operación habitual."],
  ["OTHER","Otros","Gastos que no correspondan a otra categoría definida."],
];
const centers=[
  ["CC-ADMIN","Administración general","Gastos generales de administración corporativa.",null],
  ["CC-HOC","Hostal Oasis Centro","Gastos asociados a la operación de Hostal Oasis Centro.","HOC"],
  ["CC-HOB","Hostal Oasis Cobija","Gastos asociados a la operación de Hostal Oasis Cobija.","HOB"],
  ["CC-OM","Oasis Modulares","Gastos asociados a fabricación y operación de modulares.","OM"],
  ["CC-DA","Distribuidora Altiplánica","Gastos asociados a la operación de Distribuidora Altiplánica.","DA"],
];
async function rows(promise,label){const{data,error}=await promise;if(error)throw new Error(`${label}: ${error.message}`);return data??[]}
const companies=await rows(db.from("companies").select("id").eq("code","OASIS").is("deleted_at",null),"Oasis Company");
if(companies.length!==1)throw new Error(`Oasis Company no es inequívoca (${companies.length} coincidencias)`);const companyId=companies[0].id;
const units=await rows(db.from("business_units").select("id,code").eq("company_id",companyId).in("code",["HOC","HOB","OM","DA"]).is("deleted_at",null),"unidades");
if(units.length!==4||new Set(units.map(x=>x.code)).size!==4)throw new Error("Las unidades HOC, HOB, OM y DA no son inequívocas");const unitId=Object.fromEntries(units.map(x=>[x.code,x.id]));
const admins=await rows(db.from("profiles").select("id,roles!inner(key)").eq("active",true).is("deleted_at",null).eq("roles.key","superadmin"),"Superadministrador");
if(admins.length!==1)throw new Error(`El Superadministrador activo no es inequívoco (${admins.length} coincidencias)`);const actorId=admins[0].id;
const summary={categories:{created:0,updated:0},cost_centers:{created:0,updated:0}};
async function apply(table,code,name,description,businessUnitId,summaryKey){const existing=await rows(db.from(table).select("id").eq("company_id",companyId).eq("code",code).is("deleted_at",null),`${table}:${code}`);if(existing.length>1)throw new Error(`Código ambiguo ${table}:${code}`);const payload={name,description,business_unit_id:businessUnitId,active:true};let entityId,action;if(existing.length===1){const{error}=await db.from(table).update(payload).eq("id",existing[0].id);if(error)throw error;entityId=existing[0].id;action="updated";summary[summaryKey].updated++;}else{const{data,error}=await db.from(table).insert({company_id:companyId,code,...payload,created_by:actorId}).select("id").single();if(error)throw error;entityId=data.id;action="created";summary[summaryKey].created++;}const{error:auditError}=await db.from("audit_logs").insert({company_id:companyId,business_unit_id:businessUnitId,actor_id:actorId,action:`initial_catalog_${action}`,entity_type:table,entity_id:entityId,new_data:{code,name,description,business_unit_id:businessUnitId,active:true}});if(auditError)throw auditError;}
for(const[code,name,description]of categories)await apply("expense_categories",code,name,description,null,"categories");
for(const[code,name,description,unitCode]of centers)await apply("cost_centers",code,name,description,unitCode?unitId[unitCode]:null,"cost_centers");
console.log(JSON.stringify(summary));
