import { AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { getUnattachedMediaForUser, insertUnattachedMedia } from '@/db/unattached-media.ts';
import { z } from '@/deps.ts';
import { fileSchema } from '@/schema.ts';
import { configUploader as uploader } from '@/uploaders/config.ts';
import { parseBody } from '@/utils/web.ts';
import { renderAttachment } from '@/views/attachment.ts';
import { jsonMediaDataSchema } from '@/schemas/nostr.ts';

const uploadSchema = fileSchema
  .refine((file) => !!file.type, 'File type is required.')
  .refine((file) => file.size <= Conf.maxUploadSize, 'File size is too large.');

const mediaBodySchema = z.object({
  file: uploadSchema,
  thumbnail: uploadSchema.optional(),
  description: z.string().optional(),
  focus: z.string().optional(),
});

const mediaController: AppController = async (c) => {
  const result = mediaBodySchema.safeParse(await parseBody(c.req.raw));

  if (!result.success) {
    return c.json({ error: 'Bad request.', schema: result.error }, 422);
  }

  try {
    const { file, description } = result.data;
    const { cid } = await uploader.upload(file);

    const url = new URL(`/ipfs/${cid}`, Conf.mediaDomain).toString();

    const media = await insertUnattachedMedia({
      pubkey: c.get('pubkey')!,
      url,
      data: {
        name: file.name,
        mime: file.type,
        size: file.size,
        description,
      },
    });

    return c.json(renderAttachment(media));
  } catch (e) {
    console.error(e);
    return c.json({ error: 'Failed to upload file.' }, 500);
  }
};

const updateMediaController: AppController = async (c) => {
  const pubkey = c.get('pubkey')!;
  const mediaId = c.req.param('id');

  const media = await getUnattachedMediaForUser(pubkey, mediaId);

  if (!media) {
    return c.json({ error: 'Media not found.' }, 404);
  }

  const result = mediaBodySchema.safeParse(await parseBody(c.req.raw));

  if (!result.success) {
    return c.json({ error: 'Bad request.', schema: result.error }, 422);
  }

  const data = jsonMediaDataSchema.parse(media.data);


};

export { mediaController, updateMediaController };
