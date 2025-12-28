import { createClient } from "@supabase/supabase-js";
import { env } from "../env";

export const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

export const supabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Admin client for Socket.io authentication (using service role key)
export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Client with anon key for verifying user tokens
// export const supabaseAnon = createClient(
//   env.SUPABASE_URL,
//   process.env.SUPABASE_ANON_KEY || "",
//   {
//     auth: {
//       autoRefreshToken: false,
//       persistSession: false,
//     },
//   }
// );