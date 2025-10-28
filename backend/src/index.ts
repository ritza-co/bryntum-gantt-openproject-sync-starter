import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import {
    DependencySchemaType,
    TaskSchemaType,
    SyncSuccessResponse,
    WorkPackage,
    Relation
} from './types.js';

const app = express();
const PORT = process.env.PORT || 1337;

app.use(cors({
    origin : 'http://localhost:5173'
}));

app.use(express.json());

const OPENPROJECT_BASE_URL = process.env.OPENPROJECT_BASE_URL;
const OPENPROJECT_ACCESS_TOKEN = process.env.OPENPROJECT_ACCESS_TOKEN;

app.get('/api/openproject/load', async(req, res) => {
    try {
        const workPackagesData = await makeOpenProjectRequest('/api/v3/projects/1/work_packages?sortBy=' + encodeURIComponent('[["id","asc"]]'));
        const tasks = workPackagesData._embedded?.elements || [];
        const bryntumTasks = tasks.map(mapOpenProjectToBryntum);

        // Get all work package IDs to filter relations
        const workPackageIds = tasks.map((task: { id: number }) => task.id);

        // Fetch relations - filter by involved work packages from this project
        const relationsData = await makeOpenProjectRequest('/api/v3/relations');
        const relations = relationsData._embedded?.elements || [];

        // Filter relations to only include those between work packages in this project
        const projectRelations = relations.filter((relation: Relation) => {
            const fromMatch = relation._links.from.href.match(/\/work_packages\/(\d+)$/);
            const toMatch = relation._links.to.href.match(/\/work_packages\/(\d+)$/);

            if (!fromMatch || !toMatch) return false;

            const fromId = parseInt(fromMatch[1], 10);
            const toId = parseInt(toMatch[1], 10);

            return workPackageIds.includes(fromId) && workPackageIds.includes(toId);
        });

        // Map relations to Bryntum dependencies
        const bryntumDependencies = projectRelations
            .map(mapOpenProjectRelationToBryntum)
            .filter((dep: DependencySchemaType) => dep !== null);

        res.json({
            success   : true,
            requestId : req.headers['x-request-id'] || Date.now(),
            revision  : 1,
            tasks     : {
                rows  : bryntumTasks,
                total : bryntumTasks.length
            },
            dependencies : {
                rows  : bryntumDependencies,
                total : bryntumDependencies.length
            }
        });
    }
    catch (error: unknown) {
        console.error('Error loading OpenProject data:', error);
        res.status(500).json({
            success : false,
            message : error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

app.post('/api/openproject/sync', async(req, res) => {

    try {
        const syncSuccessResponse: SyncSuccessResponse = {
            success   : true,
            requestId : req.body.requestId || Date.now(),

            tasks        : { rows : [] },
            dependencies : { rows : [] }
        };

        const { tasks, dependencies } = req.body;

        if (tasks) {
            // Handle added tasks - map phantom IDs to real IDs
            if (tasks.added) {
                for (const task of tasks.added) {
                    const { $PhantomId, ...taskData } = task;
                    let type = 'Task';
                    if (task.duration === 0) {
                        type = 'Milestone';
                    }
                    const openProjectPayload = mapBryntumToOpenProject(taskData, type);

                    const newWorkPackage = await makeOpenProjectRequest('/api/v3/work_packages', {
                        method : 'POST',
                        body   : JSON.stringify(openProjectPayload)
                    });

                    const response: TaskSchemaType = {
                        $PhantomId : $PhantomId,
                        id         : newWorkPackage.id,
                        type       : type,
                        status     : 'New'
                    };

                    // If this is a milestone, return the date that was set
                    if (type === 'Milestone' && newWorkPackage.date) {
                        response.startDate = newWorkPackage.date;
                        response.endDate = newWorkPackage.date;
                    }

                    syncSuccessResponse.tasks.rows.push(response);
                }
            }

            // Handle updated tasks
            if (tasks.updated) {
                for (const task of tasks.updated) {
                    // First get the current work package to obtain the lockVersion
                    const currentWorkPackage = await makeOpenProjectRequest(`/api/v3/work_packages/${task.id}`);

                    // Prepare update payload with current lockVersion
                    const updatePayload: Partial<WorkPackage> = {
                        lockVersion : currentWorkPackage.lockVersion as number,
                        _links      : {} as Partial<WorkPackage>['_links']
                    };

                    // Only include fields that are being updated
                    if (task.name !== undefined) {
                        updatePayload.subject = task.name;
                    }

                    // If inactive is false, convert to summary/phase task
                    if (task.inactive === false) {
                        updatePayload._links!.type = {
                            href  : '/api/v3/types/3',
                            title : 'Phase'
                        };
                    }
                    // If duration is updated to 0, convert to milestone
                    else if (task.duration === 0) {
                        // Set milestone date - use startDate or endDate if provided, otherwise use current date
                        const milestoneDate = task.startDate || task.endDate || currentWorkPackage.date || currentWorkPackage.startDate || new Date().toISOString();
                        updatePayload.date = formatDateForOpenProject(milestoneDate);
                        updatePayload.startDate = null;
                        updatePayload.dueDate = null;

                        // Update type to Milestone
                        updatePayload._links!.type = {
                            href  : '/api/v3/types/2',
                            title : 'Milestone'
                        };
                    }
                    else if (task.duration !== undefined && task.duration >= 1 && currentWorkPackage._links.type?.title === 'Milestone') {
                        // If duration is updated to 1 or more and it was a milestone, convert to task
                        // Set startDate and dueDate - use provided values or calculate from milestone date
                        if (task.startDate !== undefined) {
                            updatePayload.startDate = formatDateForOpenProject(task.startDate);
                        }
                        else if (task.endDate !== undefined) {
                            // Calculate startDate from endDate and duration
                            // Bryntum duration represents the span, so subtract duration from endDate
                            const endDate = new Date(task.endDate);
                            const startDate = new Date(endDate);
                            startDate.setDate(endDate.getDate() - task.duration);
                            updatePayload.startDate = formatDateForOpenProject(startDate.toISOString());
                        }
                        else {
                            // Use the milestone date as startDate
                            updatePayload.startDate = currentWorkPackage.date;
                        }

                        if (task.endDate !== undefined) {
                            updatePayload.dueDate = formatDateForOpenProject(task.endDate);
                        }
                        else if (task.startDate !== undefined) {
                            // Calculate dueDate from startDate and duration
                            // Bryntum duration represents the span, so add duration to startDate
                            const startDate = new Date(task.startDate);
                            const endDate = new Date(startDate);
                            endDate.setDate(startDate.getDate() + task.duration);
                            updatePayload.dueDate = formatDateForOpenProject(endDate.toISOString());
                        }
                        else {
                            // Calculate dueDate from milestone date and duration
                            // Bryntum duration represents the span, so add duration to startDate
                            const startDate = new Date(currentWorkPackage.date || new Date());
                            const endDate = new Date(startDate);
                            endDate.setDate(startDate.getDate() + task.duration);
                            updatePayload.dueDate = formatDateForOpenProject(endDate.toISOString());
                        }

                        // Don't send date field for tasks - only set it to null if needed
                        // Don't set duration when we have startDate and dueDate
                        // OpenProject will calculate it automatically

                        // Update type to Task
                        updatePayload._links!.type = {
                            href  : '/api/v3/types/1',
                            title : 'Task'
                        };
                    }
                    else {
                        // Regular task updates
                        if (task.startDate !== undefined) {
                            updatePayload.startDate = formatDateForOpenProject(task.startDate);
                        }
                        if (task.endDate !== undefined) {
                            updatePayload.dueDate = formatDateForOpenProject(task.endDate);
                        }
                        if (task.duration !== undefined && !(task.startDate && task.endDate)) {
                            updatePayload.duration = task.duration ? `P${task.duration}D` : null;
                        }
                    }

                    if (task.percentDone !== undefined) {
                        updatePayload.percentageDone = task.percentDone;
                    }
                    if (task.status !== undefined) {
                        const statusHref = getStatusHrefForTitle(task.status);
                        if (statusHref) {
                            updatePayload._links!.status = { href : statusHref, title : task.status };
                        }
                    }

                    const updatedWorkPackage = await makeOpenProjectRequest(`/api/v3/work_packages/${task.id}`, {
                        method : 'PATCH',
                        body   : JSON.stringify(updatePayload)
                    });

                    // If converted to Summary task, return the type
                    if (task.inactive === false) {
                        syncSuccessResponse.tasks.rows.push({
                            id   : task.id,
                            type : 'Summary task'
                        });
                    }
                    // If converted to milestone, return the date and type so Bryntum can update the display
                    else if (task.duration === 0 && updatedWorkPackage.date) {
                        syncSuccessResponse.tasks.rows.push({
                            id        : task.id,
                            startDate : updatedWorkPackage.date,
                            endDate   : updatedWorkPackage.date,
                            type      : 'Milestone'
                        });
                    }
                    // If converted from milestone to task, return the type
                    else if (task.duration !== undefined && task.duration >= 1 && currentWorkPackage._links.type?.title === 'Milestone') {
                        syncSuccessResponse.tasks.rows.push({
                            id   : task.id,
                            type : 'Task'
                        });
                    }
                }
            }

            // Handle removed tasks
            if (tasks.removed) {
                for (const task of tasks.removed) {
                    // Use the standard API endpoint for individual work package deletion
                    await makeOpenProjectRequest(`/api/v3/work_packages/${task.id}`, {
                        method : 'DELETE'
                    });
                }
            }
        }

        if (dependencies) {
            console.log('Dependency sync not yet implemented for OpenProject API');
        }

        res.json(syncSuccessResponse);
    }
    catch (error: unknown) {
        console.error('Error syncing data:', error);
        res.status(500).json({
            success : false,
            message : error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// OpenProject API helper functions
const createOpenProjectAuth = () => {
    if (!OPENPROJECT_ACCESS_TOKEN) {
        throw new Error('OpenProject access token not configured');
    }
    const credentials = Buffer.from(`apikey:${OPENPROJECT_ACCESS_TOKEN}`).toString('base64');
    return `Basic ${credentials}`;
};

const makeOpenProjectRequest = async(endpoint: string, options: RequestInit = {}) => {
    const url = `${OPENPROJECT_BASE_URL}${endpoint}`;
    const auth = createOpenProjectAuth();

    const response = await fetch(url, {
        ...options,
        headers : {
            'Authorization' : auth,
            'Content-Type'  : 'application/json',
            ...options.headers
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenProject API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    // Handle empty response bodies (for DELETE requests)
    const text = await response.text();
    if (!text) {
        return {}; // Return empty object for empty responses
    }

    try {
        return JSON.parse(text);
    }
    catch(error: unknown) {
        console.error('Error parsing JSON response:', error);
        throw new Error(`Invalid JSON response: ${text}`);
    }
};

// Helper function to convert datetime string to date-only format for OpenProject
const formatDateForOpenProject = (dateString: string | null): string | null => {
    if (!dateString) return null;

    // Extract just the date part (YYYY-MM-DD) from datetime string
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;

    return date.toISOString().split('T')[0];
};

// Helper function to map status titles to OpenProject status hrefs
const getStatusHrefForTitle = (statusTitle: string): string | null => {
    // Common OpenProject status mappings
    const statusMap: { [key: string]: number } = {
        'New'         : 1,
        'In progress' : 7,
        'In Progress' : 7,
        'On hold'     : 13,
        'On Hold'     : 13,
        'Rejected'    : 14,
        'Closed'      : 12,
        'Resolved'    : 11
    };

    const statusId = statusMap[statusTitle];
    return statusId ? `/api/v3/statuses/${statusId}` : null;
};

// Data mapping functions between Bryntum Gantt and OpenProject
const mapBryntumToOpenProject = (task: TaskSchemaType, type: string) => {
    const payload: Partial<WorkPackage> = {
        subject              : task.name ?? '',
        scheduleManually     : true,  // use manual scheduling to avoid constraints
        estimatedTime        : null,
        ignoreNonWorkingDays : false,
        percentageDone       : task.percentDone || null,
        _links               : {
            category : {
                href : null
            },
            type : {
                href  : type === 'Milestone' ? '/api/v3/types/2' : '/api/v3/types/1',
                title : type
            },
            priority : {
                href  : '/api/v3/priorities/8',
                title : 'Normal'
            },
            project : {
                href  : '/api/v3/projects/1',
                title : 'Demo project'
            },
            projectPhase : {
                href  : null,
                title : null
            },
            projectPhaseDefinition : {
                href  : null,
                title : null
            },
            status : {
                href  : '/api/v3/statuses/1',
                title : 'New'
            },
            responsible : {
                href : null
            },
            assignee : {
                href : null
            },
            version : {
                href : null
            },
            parent : {
                href  : task.parentId ? `/api/v3/work_packages/${task.parentId}` : null,
                title : null
            },
            self : {
                href : null
            },
            attachments : []
        },
        description : {
            raw : ''
        }
    };

    // Handle date fields differently for milestones vs tasks
    if (type === 'Milestone') {
        // Milestones only have a 'date' field, no startDate or dueDate
        // Use startDate if provided, otherwise use endDate, otherwise use today's date
        const milestoneDate = task.startDate || task.endDate || new Date().toISOString();
        payload.date = formatDateForOpenProject(milestoneDate);
    }
    else {
        // Tasks have startDate and dueDate
        payload.startDate = task.startDate ? formatDateForOpenProject(task.startDate) : null;
        payload.dueDate = task.endDate ? formatDateForOpenProject(task.endDate) : null;

        // Only add duration if it's a positive number
        if (task.duration !== undefined && task.duration !== null && task.duration > 0) {
            payload.duration = `P${task.duration}D`;
        }
    }

    // For updates, we need lockVersion and should omit _links structure
    if (task.id) {
        return {
            lockVersion    : 1,
            _links         : {},
            subject        : task.name,
            startDate      : formatDateForOpenProject(task.startDate ?? null),
            dueDate        : formatDateForOpenProject(task.endDate ?? null),
            duration       : (task.startDate && task.endDate) ? null : (task.duration ? `P${task.duration}D` : null),
            percentageDone : task.percentDone || null
        };
    }

    return payload;
};

const mapOpenProjectToBryntum = (workPackage: WorkPackage) => {
    // Extract parent ID from parent href if exists
    let parentId = null;
    if (workPackage._links?.parent?.href) {
        const match = workPackage._links.parent.href.match(/\/work_packages\/(\d+)$/);
        if (match) {
            parentId = parseInt(match[1], 10);
        }
    }

    // Parse duration from OpenProject format "P14D" to number of days
    let duration = null;
    if (workPackage.duration) {
        const match = workPackage.duration.toString().match(/P(\d+)D/);
        if (match) {
            duration = parseInt(match[1], 10);
        }
    }

    // Handle different date fields:
    // - Milestones use the "date" field for both start and end
    // - Regular tasks use startDate/dueDate
    let startDate, endDate;

    if (workPackage.date) {
        // Milestone - use same date for both start and end
        startDate = workPackage.date;
        endDate = workPackage.date;
    }
    else {
        // Regular task - use start/due dates
        startDate = workPackage.startDate || null;

        // Use OpenProject dueDate directly with manual scheduling
        endDate = workPackage.dueDate || null;
    }

    const taskData = {
        id                : workPackage.id,
        name              : workPackage.subject || '',
        startDate         : startDate,
        endDate           : endDate,
        duration          : duration,
        percentDone       : workPackage.percentageDone || 0,
        parentId          : parentId,
        expanded          : true, // OpenProject doesn't have this field
        rollup            : false, // OpenProject doesn't have this field
        manuallyScheduled : workPackage.scheduleManually,
        status            : workPackage._links.status?.title,
        type              : workPackage._links.type?.title
    };

    // Filter out null values
    return Object.fromEntries(
        Object.entries(taskData).filter(([_, value]) => value !== null)
    );
};

// Map OpenProject relation types to Bryntum dependency types
const mapOpenProjectRelationTypeToBryntum = (relationType: string): number => {
    // Bryntum dependency types:
    //    0 = StartToStart, 1 = StartToEnd, 2 = EndToStart, 3 = EndToEnd
    // return End-to-Start for simplicity (most common)
    return 2;
};

// Map OpenProject relation to Bryntum dependency
const mapOpenProjectRelationToBryntum = (relation: Relation) => {
    // Extract work package IDs from href links
    const fromMatch = relation._links.from.href.match(/\/work_packages\/(\d+)$/);
    const toMatch = relation._links.to.href.match(/\/work_packages\/(\d+)$/);

    if (!fromMatch || !toMatch) {
        return null;
    }

    const fromId = parseInt(fromMatch[1], 10);
    const toId = parseInt(toMatch[1], 10);

    // In OpenProject: "to follows from" means "from" must finish before "to" can start
    // In Bryntum: fromEvent is the predecessor, toEvent is the successor
    // So we swap them: OpenProject's "from" becomes Bryntum's "toEvent" and vice versa
    const dependencyData = {
        id        : relation.id,
        fromEvent : toId,  // Swapped: OpenProject's "to" becomes Bryntum's "fromEvent"
        toEvent   : fromId,  // Swapped: OpenProject's "from" becomes Bryntum's "toEvent"
        type      : mapOpenProjectRelationTypeToBryntum(relation.type),
        lag       : relation.lag || 0,
        lagUnit   : 'day',
        active    : true
    };

    // Filter out null values
    return Object.fromEntries(
        Object.entries(dependencyData).filter(([_, value]) => value !== null)
    );
};

app.listen(PORT, async() => {
    console.log(`Server running on http://localhost:${PORT}`);
});