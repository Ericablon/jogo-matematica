// Configuração do Supabase do projeto "jogo de matemática"
// Projeto: ctnylpmumkbhuyctehtc
// Nunca cole service_role, chave secreta ou senha privada aqui.

const URL_SUPABASE = "https://ctnylpmumkbhuyctehtc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_o9-OnYZZXdfiDhkwyCDfIw_W_isidrd";

window.URL_SUPABASE = URL_SUPABASE;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
window.cliente_supabase = window.supabase.createClient(URL_SUPABASE, SUPABASE_ANON_KEY);
