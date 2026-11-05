export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Wird geladen">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-44 w-full rounded-[22px]" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-40 rounded-[22px]" />
        <Skeleton className="h-40 rounded-[22px]" />
      </div>
    </div>
  );
}
