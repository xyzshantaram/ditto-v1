import { z } from 'zod';

type FieldType = 'string' | 'multi_string' | 'number' | 'multi_number' | 'boolean' | 'unknown';

export interface FieldItem {
  type: FieldType;
  description?: string;
  optional?: boolean;
  default?: any;
}

interface UnwrappedZodType {
  baseType: z.ZodTypeAny;
  optional?: boolean;
  defaultValue?: any;
  description?: string;
}

/**
 * Extracts the base type from wrapped Zod types like ZodOptional and ZodDefault.
 */
function unwrapZodType(field: z.ZodTypeAny): UnwrappedZodType {
  let optional = false;
  let defaultValue: any = undefined;
  let description: string | undefined = undefined;

  description = field.description;

  while (field instanceof z.ZodOptional || field instanceof z.ZodDefault) {
    if (field instanceof z.ZodOptional) optional = true;
    if (field instanceof z.ZodDefault) defaultValue = field._def.defaultValue();
    if (!description) description = field.description;

    field = field._def.innerType;
  }

  const result: UnwrappedZodType = { baseType: field };

  if (optional) result.optional = true;
  if (typeof defaultValue !== 'undefined') {
    if (
      typeof defaultValue === 'string' && defaultValue.length > 0 ||
      (typeof defaultValue === 'number') ||
      (typeof defaultValue === 'object' && Object.keys(defaultValue).length > 0) ||
      (Array.isArray(defaultValue) && defaultValue.length > 0)
    ) {
      result.defaultValue = defaultValue;
    }
  }
  if (description) result.description = description;
  return result;
}

/**
 * Serializes a Zod schema into a record of field types. NOT meant to be used
 * as a general-purpose serializer - this is specifically for generating policy
 * parameter descriptions! This function also parses internal Zod properties,
 * but there is precedent for this:
 * https://github.com/colinhacks/zod/discussions/1953
 *
 * With version pinning and the Zod maintainers' knowledge of this kind of
 * usage, it should be fine for it to be this way.
 *
 * Special-cases NIP-01 filters as `multi_string`.
 */
export function zodSchemaToFields(schema: z.ZodObject<any>): Record<string, FieldItem> {
  const result: Record<string, FieldItem> = {};

  for (const [key, field] of Object.entries(schema.shape) as [string, z.ZodTypeAny][]) {
    const { baseType, optional, defaultValue, description } = unwrapZodType(field);
    result[key] = { type: 'unknown' };
    if (optional) result[key].optional = optional;
    if (defaultValue) result[key].default = defaultValue;
    if (description) result[key].description = description;

    if (key === 'filters') {
      result[key].type = 'multi_string';
    } else if (baseType instanceof z.ZodArray) {
      const elementType = unwrapZodType(baseType._def.type).baseType._def.typeName;
      if (elementType === 'ZodNumber') result[key].type = 'multi_number';
      else result[key].type = 'multi_string';
    } else if (baseType instanceof z.ZodNumber) result[key].type = 'number';
    else if (baseType instanceof z.ZodBoolean) result[key].type = 'boolean';
    else if (baseType instanceof z.ZodString) result[key].type = 'string';

    if (baseType.description && !result[key].description) result[key].description = baseType.description;
  }

  return result;
}
