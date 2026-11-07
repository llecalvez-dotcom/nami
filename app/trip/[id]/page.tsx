import { Suspense } from "react";
import { TripScreen } from "@/components/trip/trip-screen";

export default function TripPage({ params }: PageProps<"/trip/[id]">) {
  return (
    <Suspense fallback={<div className="flex-1" aria-busy="true" />}>
      {params.then(({ id }) => (
        <TripScreen id={id} />
      ))}
    </Suspense>
  );
}
