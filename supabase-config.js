// Configuração do Supabase
// Projeto: jogo de matemática
// Project ID: ctnylpmumkbhuyctehtc

const SUPABASE_URL = "https://ctnylpmumkbhuyctehtc.supabase.co";

const SUPABASE_ANON_KEY = "sb_publishable_o9-OnYZZXdfiDhkwyCDfIw_W_isidrd";

window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

window.supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

window.cliente_supabase = window.supabaseClient;
window.sb = window.supabaseClient;
