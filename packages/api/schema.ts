import ISO6391 from 'iso-639-1';
import { z } from 'zod';

/** https://github.com/colinhacks/zod/issues/1630#issuecomment-1365983831 */
export const booleanParamSchema = z.enum(['true', 'false']).transform((value) => value === 'true');

/** Value is a ISO-639-1 language code. */
export const languageSchema = z.string().refine(
  (val) => ISO6391.validate(val),
  { message: 'Not a valid language in ISO-639-1 format' },
);
