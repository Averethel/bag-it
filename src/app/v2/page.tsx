import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Bag It",
  description: "Prepare physical bags with the production step detector.",
}

export default function V2Page() {
  redirect("/")
}
