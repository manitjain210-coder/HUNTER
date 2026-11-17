/* eslint-disable @next/next/no-img-element -- photos come from our authorised /api/files route at original quality */
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { ActionButton, ActionForm, Submit } from "./form";
import { PhotoPicker } from "./photo-client";
import { addPhotosAction, changePhotoAction } from "@/app/actions/ops";
import { MAX_IMAGES } from "@/services/files";

/** Cover photo, cropped to fill a fixed frame; a calm placeholder when the seller has not added one. */
export function Cover({ id, alt, className = "" }: { id?: string; alt: string; className?: string }) {
  if (!id)
    return (
      <div className={cn("flex flex-col items-center justify-center gap-1 bg-sand text-muted-foreground", className)} role="img" aria-label={`No photo of ${alt} yet`}>
        <ImageOff aria-hidden className="size-5 opacity-60" />
        <span className="text-[11px]">No photo yet</span>
      </div>
    );
  return <img src={`/api/files/${id}`} alt={alt} loading="lazy" decoding="async" className={cn("object-cover", className)} />;
}

/** Owner view: current photos with make-cover / remove, plus an uploader. */
export function PhotoManager({ ids, target, canEdit }: { ids: string[]; target: { productId?: string; lotId?: string }; canEdit: boolean }) {
  return (
    <div className="space-y-3">
      {ids.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {ids.map((id, i) => (
            <li key={id} className="space-y-1">
              <div className="relative">
                <img src={`/api/files/${id}`} alt={`Photo ${i + 1}`} loading="lazy" className="aspect-square w-full rounded-xl object-cover ring-1 ring-line" />
                {i === 0 && <span className="absolute left-1.5 top-1.5 rounded-md bg-ink/75 px-1.5 py-0.5 text-[10px] font-medium text-white">Cover</span>}
              </div>
              {canEdit && (
                <div className="flex flex-wrap gap-1 [&_.btn]:min-h-0 [&_.btn]:px-2 [&_.btn]:py-1 [&_.btn]:text-xs">
                  {i > 0 && <ActionButton action={changePhotoAction} fields={{ fileId: id, op: "cover" }} variant="ghost">Make cover</ActionButton>}
                  <ActionButton action={changePhotoAction} fields={{ fileId: id, op: "remove" }} variant="danger">Remove</ActionButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted-foreground">No photos yet. Listings with a clear photo are easier to recognise at collection.</p>}
      {canEdit && ids.length < MAX_IMAGES && (
        <ActionForm action={addPhotosAction} resetOnSuccess className="space-y-3">
          {target.productId && <input type="hidden" name="productId" value={target.productId} />}
          {target.lotId && <input type="hidden" name="lotId" value={target.lotId} />}
          <PhotoPicker max={MAX_IMAGES - ids.length} label="Add photos" />
          <Submit variant="ghost">Upload photos</Submit>
        </ActionForm>
      )}
    </div>
  );
}
