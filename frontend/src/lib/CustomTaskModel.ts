import { TaskModel } from '@bryntum/gantt';

// Custom event model
export default class CustomTaskModel extends TaskModel {
    static $name = 'CustomTaskModel';

    static fields = [
        { name : 'status', type : 'string' },
        { name : 'type', type : 'string' }
    ];
}