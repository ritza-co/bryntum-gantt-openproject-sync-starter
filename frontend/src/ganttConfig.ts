import { Model, type GanttConfig  } from '@bryntum/gantt';
import CustomTaskModel from './lib/CustomTaskModel';

export const ganttConfig: GanttConfig = {
    appendTo   : 'app',
    viewPreset : 'weekAndDayLetter',
    barMargin  : 10,
    project    : {
        taskStore : {
            modelClass        : CustomTaskModel,
            transformFlatData : true
        },
        loadUrl          : 'http://localhost:1337/api/openproject/load',
        autoLoad         : true,
        syncUrl          : 'http://localhost:1337/api/openproject/sync',
        autoSync         : true,
        // This config enables response validation and dumping of found errors to the browser console.
        // It's meant to be used as a development stage helper only so please set it to false for production.
        validateResponse : true
    },
    taskRenderer({ taskRecord, renderData }) {
        if (taskRecord.get('type') === 'Summary task') {
            renderData.style = 'background-color: #ff8f2b';
        }
        if (taskRecord.get('type') === 'Task') {
            renderData.style = 'background-color: #1b66a3';
        }
        if (taskRecord.get('type') === 'Milestone') {
            renderData.style = 'background-color: #2a9a30';
        }
        return '';
    },
    columns : [
        {
            field    : 'type',
            text     : 'Type',
            width    : 120,
            readOnly : true,
            renderer : ({ record }: { record: Model }) => ({
            // Return a DomConfig object describing our custom markup with the task name and a child count badge
            // See https://bryntum.com/products/grid/docs/api/Core/helper/DomHelper#typedef-DomConfig for more information.
                children : [
                    record.get('type') === 'Summary task' ? {
                        style : 'color: #ff8f2b;',
                        text  : record.get('type')
                    } : record.get('type') === 'Task' ? {
                        style : 'color: #1b66a3;',
                        text  : record.get('type')
                    } : record.get('type') === 'Milestone' ? {
                        style : 'color: #2a9a30;',
                        text  : record.get('type')
                    } : null
                ]
            })
        },
        { type : 'name', field : 'name', text : 'Subject', width : 300
        },
        {
            text   : 'Status',
            field  : 'status',
            width  : 100,
            editor : {
                type       : 'combo',
                editable   : false,
                autoExpand : true,
                items      : [
                    ['New', 'New'],
                    ['In Progress', 'In Progress'],
                    ['Closed', 'Closed'],
                    ['On hold', 'On hold'],
                    ['Rejected', 'Rejected']
                ]
            }
        },
        { type : 'startdate', field : 'startDate', text : 'Start Date', width : 105 },
        { type : 'enddate', field : 'endDate', text : 'Finish Date', width : 105 },
        { type : 'duration', field : 'fullDuration', text : 'Duration', width : 80 }
    ]
};
