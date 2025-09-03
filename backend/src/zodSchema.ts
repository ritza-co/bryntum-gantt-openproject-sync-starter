import { z } from 'zod';

export const TaskSchema = z.object({
    id                : z.number(),
    name              : z.string().optional(),
    startDate         : z.string().optional(),
    endDate           : z.string().optional(),
    duration          : z.number().optional(),
    percentDone       : z.number().optional(),
    parentId          : z.number().optional(),
    expanded          : z.boolean().optional(),
    rollup            : z.boolean().optional(),
    manuallyScheduled : z.boolean().optional()
});

export const DependencySchema = z.object({
    id        : z.number(),
    fromEvent : z.number().optional(),
    toEvent   : z.number().optional(),
    type      : z.number(),
    cls       : z.string().optional(),
    lag       : z.number(),
    lagUnit   : z.string(),
    active    : z.boolean(),
    fromSide  : z.string().optional(),
    toSide    : z.string().optional()
});