"use client";

import { useEffect, useState } from "react";
import {
  debugSchemaAll,
  getTableColumnsFromInformationSchema,
} from "@/lib/supabase/debug";

export default function DebugSchemaPage() {
  const [result, setResult] = useState<{
    infoSchema: { artworks: string[]; artwork_images: string[]; profiles: string[] };
    inferred: { artworks: string[]; artwork_images: string[]; profiles: string[] };
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function run() {
      if (process.env.NODE_ENV !== "development") {
        setResult(null);
        setLoading(false);
        return;
      }

      const [infoSchema, inferred] = await Promise.all([
        (async () => {
          const [artworks, artwork_images, profiles] = await Promise.all([
            getTableColumnsFromInformationSchema("artworks"),
            getTableColumnsFromInformationSchema("artwork_images"),
            getTableColumnsFromInformationSchema("profiles"),
          ]);
          return { artworks, artwork_images, profiles };
        })(),
        debugSchemaAll(),
      ]);

      setResult({ infoSchema, inferred });
      console.log("Schema debug - information_schema:", infoSchema);
      console.log("Schema debug - inferred from select *:", inferred);
      setLoading(false);
    }
    run();
  }, []);

  if (process.env.NODE_ENV !== "development") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-zinc-600">Only available in development.</p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-zinc-600">Loading...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-xl font-semibold">Schema Debug</h1>
      <div className="space-y-6 font-mono text-sm">
        <section>
          <h2 className="mb-2 font-semibold text-zinc-900">
            information_schema.columns (requires DB function)
          </h2>
          <pre className="rounded bg-zinc-100 p-4">
            artworks: {JSON.stringify(result?.infoSchema.artworks ?? [], null, 2)}
            {"\n"}
            artwork_images: {JSON.stringify(result?.infoSchema.artwork_images ?? [], null, 2)}
            {"\n"}
            profiles: {JSON.stringify(result?.infoSchema.profiles ?? [], null, 2)}
          </pre>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-zinc-900">
            Inferred from select * limit 1
          </h2>
          <pre className="rounded bg-zinc-100 p-4">
            artworks: {JSON.stringify(result?.inferred.artworks ?? [], null, 2)}
            {"\n"}
            artwork_images: {JSON.stringify(result?.inferred.artwork_images ?? [], null, 2)}
            {"\n"}
            profiles: {JSON.stringify(result?.inferred.profiles ?? [], null, 2)}
          </pre>
        </section>
      </div>
    </main>
  );
}
