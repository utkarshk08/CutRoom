import { MAX_BACKUP_BYTES, isSafeProjectImageSource, type ProjectDocument } from './project-document.ts';

/** Embed bundled samples too, so a backup never relies on the old site's files. */
export async function portableProjectJson(project: ProjectDocument, resolveImage: (source: string) => Promise<string>, maxBytes = MAX_BACKUP_BYTES) {
  const sources = new Map<string, string>();
  const embed = async (source: string) => {
    if (!source || /^data:image\/(?:png|jpeg|webp);base64,/i.test(source)) return source;
    if (!isSafeProjectImageSource(source)) throw new Error('The backup contains an unsupported image source.');
    if (!sources.has(source)) {
      const embedded = await resolveImage(source);
      if (!/^data:image\/(?:png|jpeg|webp);base64,/i.test(embedded)) throw new Error('A source image could not be included in the backup.');
      sources.set(source, embedded);
    }
    return sources.get(source)!;
  };
  const pieces = [];
  // Sequential resolution bounds memory and avoids a burst of large image reads.
  for (const piece of project.pieces) pieces.push({ ...piece, src: await embed(piece.src) });
  const wall = { ...project.wall, photo: project.wall.photo ? await embed(project.wall.photo) : project.wall.photo };
  const data = JSON.stringify({ ...project, pieces, wall });
  if (new Blob([data]).size > maxBytes) throw new Error(`This project exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB safe backup limit. Reduce large source images first.`);
  return data;
}
