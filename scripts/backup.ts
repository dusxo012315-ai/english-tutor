import {loadEnvConfig} from "@next/env";
import Database from "better-sqlite3";
import {dirname,join,resolve} from "node:path";
import {existsSync,mkdirSync} from "node:fs";
loadEnvConfig(process.cwd());
async function main(){
 const source=resolve(process.env.DATABASE_PATH||"./data/reading-room-demo.db");
 if(!existsSync(source))throw new Error("DB가 없습니다. 먼저 npm run db:migrate를 실행하세요.");
 const destination=join(dirname(source),"backups",`reading-room-${Date.now()}.db`);
 mkdirSync(dirname(destination),{recursive:true});
 const db=new Database(source,{readonly:true});
 try {await db.backup(destination);console.log(`Backup saved: ${destination}`);}finally{db.close();}
}
main().catch(()=>{console.error("백업하지 못했습니다. DB 경로와 쓰기 권한을 확인하세요.");process.exitCode=1;});
