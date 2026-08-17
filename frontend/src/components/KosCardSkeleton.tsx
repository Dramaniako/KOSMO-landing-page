import React from 'react';

export default function KosCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-slate-200/80 shadow-sm flex flex-col animate-pulse kos-card-skeleton">
      {/* Image Box Skeleton */}
      <div className="h-52 bg-slate-200 w-full relative" />

      {/* Content Skeleton */}
      <div className="p-5 flex flex-col flex-1 gap-3">
        {/* District and Status pill */}
        <div className="flex justify-between items-center">
          <div className="h-4 bg-slate-200 rounded-md w-24" />
          <div className="h-5 bg-slate-200 rounded-full w-20" />
        </div>

        {/* Title bar */}
        <div className="h-6 bg-slate-200 rounded-md w-3/4" />

        {/* Address bar */}
        <div className="h-4 bg-slate-200 rounded-md w-full" />

        {/* Facility badges */}
        <div className="flex gap-2 pt-2 border-t border-slate-100">
          <div className="h-6 bg-slate-200 rounded-md w-14" />
          <div className="h-6 bg-slate-200 rounded-md w-14" />
          <div className="h-6 bg-slate-200 rounded-md w-14" />
        </div>

        {/* Footer: Price tag & Action button */}
        <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-100">
          <div className="h-6 bg-slate-200 rounded-md w-28" />
          <div className="h-9 bg-slate-200 rounded-xl w-24" />
        </div>
      </div>
    </div>
  );
}
