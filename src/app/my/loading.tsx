export default function MyLoading() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8 flex animate-pulse gap-4">
        <div className="h-16 w-16 rounded-full bg-zinc-200" />
        <div className="flex-1">
          <div className="mb-2 h-6 w-48 rounded bg-zinc-200" />
          <div className="h-4 w-24 rounded bg-zinc-100" />
        </div>
      </div>
      <div className="mb-8 h-24 rounded-lg bg-zinc-100" />
      <div className="mb-8 grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-lg bg-zinc-100" />
        ))}
      </div>
      <div className="h-40 rounded-lg bg-zinc-100" />
    </main>
  );
}
