import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://xhaikpwvqnjtryltehqf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_y0pk-Cl7wvIJOzWhJgetiw_HI5GY9Pl";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
