import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://ckdctcvxrhweppwatajr.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const userId = "ca5e6271-35c2-49bc-8068-91e81de95e96";
const password = process.env.ADMIN_NEW_PASSWORD;

if (!password) {
  console.error("ERROR: New password is missing.");
  process.exit(1);
}

const { error } = await supabase.auth.admin.updateUserById(
  userId,
  { password }
);

if (error) {
  console.error("Password reset failed:", error.message);
  process.exit(1);
}

console.log("SUCCESS: ADMIN001 password has been reset.");
