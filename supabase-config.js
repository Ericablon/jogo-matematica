// Configuração do Supabase do projeto "jogo de matemática"
// Projeto: ctnylpmumkbhuyctehtc
// Cole abaixo a sua chave pública: anon public key ou publishable key.
// Nunca cole service_role, secret key ou senha privada aqui.

const SUPABASE_URL = "https://ctnylpmumkbhuyctehtc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_o9-OnYZZXdfiDhkwyCDfIw_W_isidrd";

window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
