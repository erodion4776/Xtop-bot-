
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://mldywarnnwjitfvqpgis.supabase.co";

const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sZHl3YXJubndqaXRmdnFwZ2lzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMjg0OTYsImV4cCI6MjEwNTYwNDQ5Nn0.wCYnY-7wlxg0hN9GYIytfpr9mIMc2rURlqM3g2_aN-U";

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);
