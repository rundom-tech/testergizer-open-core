import { CoreRunnerOptions, JsonTestDefinition } from "./types";
export declare class CoreRunner {
    private browser;
    private page;
    private readonly options;
    constructor(options?: CoreRunnerOptions);
    private ensurePage;
    run(test: JsonTestDefinition): Promise<void>;
    private executeStep;
    dispose(): Promise<void>;
}
