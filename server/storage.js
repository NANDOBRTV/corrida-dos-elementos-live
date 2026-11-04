// Persistência opcional: usa Postgres somente quando DATABASE_URL existe.
// Sem DB, o processo mantém estado apenas na memória; reinicializações zeram a demonstração.
let pool;
let connected=false;
export async function openStorage() {
  if(!process.env.DATABASE_URL) return {enabled:false,load:async()=>null,save:async()=>{},close:async()=>{}};
  try {
    const {Pool}=await import("pg");
    pool=new Pool({connectionString:process.env.DATABASE_URL,max:2,
      ssl:process.env.DATABASE_SSL==="true"?{rejectUnauthorized:true}:undefined,
      connectionTimeoutMillis:5000,idleTimeoutMillis:30000});
    await pool.query("SELECT 1");
    await pool.query("CREATE TABLE IF NOT EXISTS elemental_game_state (id SMALLINT PRIMARY KEY CHECK(id=1), snapshot JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    connected=true;
    console.log("[storage] Postgres ativo");
    return {
      enabled:true,
      async load(){
        const r=await pool.query("SELECT snapshot FROM elemental_game_state WHERE id=1");
        return r.rows[0]?.snapshot??null;
      },
      async save(state){
        await pool.query("INSERT INTO elemental_game_state(id,snapshot,updated_at) VALUES(1,$1,NOW()) ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot,updated_at=NOW()",[JSON.stringify(state)]);
      },
      async close(){ await pool.end();connected=false; }
    };
  }catch(e){
    console.error("[storage] Não foi possível conectar ao Postgres; inicialização abortada.",e.message);
    if(pool)await pool.end().catch(()=>{});
    throw e; // Não fingir persistência quando a configuração de banco está incorreta.
  }
}
