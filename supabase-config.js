// Configure este arquivo depois de criar o novo projeto gratuito no Supabase.
// Copie a Project URL e a chave anon/publishable em:
// Supabase > Project Settings > API

const SUPABASE_URL = "COLE_AQUI_A_URL_DO_NOVO_PROJETO";
const SUPABASE_ANON_KEY = "COLE_AQUI_A_CHAVE_ANON_DO_NOVO_PROJETO";

window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

if (
  window.supabase &&
  !SUPABASE_URL.includes("COLE_AQUI") &&
  !SUPABASE_ANON_KEY.includes("COLE_AQUI")
) {
  window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  window.cliente_supabase = window.supabaseClient;
  window.sb = window.supabaseClient;
} else {
  console.warn("Supabase ainda não configurado. O jogo usará o armazenamento local deste navegador.");
}
