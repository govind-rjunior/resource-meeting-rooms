import { verifyPerson } from "@/lib/booking";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await verifyPerson(token);
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-xl font-semibold">{result.ok ? "Email confirmed" : "Link not valid"}</h1>
      <p className="mt-3 text-zinc-700">{result.message}</p>
      <p className="mt-6 text-sm">
        <Link href="/" className="underline">
          Back to booking
        </Link>
      </p>
    </main>
  );
}
