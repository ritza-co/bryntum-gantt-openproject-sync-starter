import { z } from 'zod';
import { DependencySchema, TaskSchema } from './zodSchema';

export type TaskSchemaType = z.infer<typeof TaskSchema>;
export type DependencySchemaType = z.infer<typeof DependencySchema>;

export type SyncSuccessResponse = {
  success: boolean;
  requestId: string;
  tasks: { rows: (Partial<TaskSchemaType> & { $PhantomId?: string })[] };
  dependencies: { rows: (Partial<DependencySchemaType> & { $PhantomId?: string })[] };
};

export type WorkPackage = {
  id: number;
  subject: string;
  startDate?: string | null;
  dueDate?: string | null;
  date: string;
  duration?: string | number | null;
  estimatedTime?: string | number | null;
  ignoreNonWorkingDays: boolean;
  lockVersion: number;
  _links: {
      parent: {
          href: string | null;
          title: string | null;
      };
      type: {
          href: string;
          title: string;
      };
      status?: {
          href: string;
          title: string;
      };
      category: {
          href: string | null;
          title?: string | null;
      };
      priority: {
          href: string;
          title: string;
      };
      project: {
          href: string;
          title: string;
      };
      projectPhase: {
          href: string | null;
          title?: string | null;
      };
      projectPhaseDefinition: {
          href: string | null;
          title?: string | null;
      };
      responsible: {
          href: string | null;
      };
      assignee: {
          href: string | null;
      };
      version: {
          href: string | null;
      };
      self: {
          href: string | null;
      };
      attachments: [];
  };
  description: {
    raw: string;
  };
  percentageDone: number | null;
  scheduleManually: boolean;
  status: string;
  type: string;
};

export type Relation = {
  id: number;
  type: string;
  from: {
      href: string;
  };
  _links: {
      from: {
          href: string;
      };
      to: {
          href: string;
      };
  };
  lag: number;
  lagUnit: string;
  active: boolean;
  fromSide: string;
  toSide: string;
};