import { z } from 'zod';
import { GSTIN_FORMAT } from '../customers/schemas';

// "gstin" is required but may be null (null clears the GSTIN and the state code).
// state_code is never accepted from the client: the server derives it from the GSTIN.
export const updateOrganizationSchema = z.object({
  gstin: z.string().trim().toUpperCase().regex(GSTIN_FORMAT, 'Invalid GSTIN format').nullable(),
});
