"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function verifyScorerPin(formData) {
  const pin = formData.get("pin");
  const correctPin = process.env.SCORER_PIN || "1234";

  if (pin === correctPin) {
    // 1. Await the cookies object (Required for Next.js 15+)
    const cookieStore = await cookies();

    // 2. Set the secure cookie
    cookieStore.set({
      name: "scorer_auth",
      value: "true",
      httpOnly: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    // 3. Redirect them to the scorer dashboard
    redirect("/scorer");
  } else {
    return { error: "Invalid PIN. Please try again." };
  }
}

export async function setAdminSession() {
  const cookieStore = await cookies();
  cookieStore.set({
    name: "admin_auth",
    value: "true",
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  redirect("/admin/matches");
}

export async function logoutAdmin() {
  const cookieStore = await cookies();
  cookieStore.delete("admin_auth");
  redirect("/admin/login");
}
