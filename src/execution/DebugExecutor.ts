import * as vscode from 'vscode';
import * as path from 'path';
import { ILanguageExecutor } from './ILanguageExecutor';
import { ExecutionTrace } from '../types';
import { DebugValueTracker } from '../tracking/DebugValueTracker';

export class DebugExecutor implements ILanguageExecutor {
    
    private languageId: string;
    private debugType: string;
    private currentSession?: vscode.DebugSession;
    private valueTracker?: DebugValueTracker;
    private disposables: vscode.Disposable[] = [];

    constructor(languageId: string, debugType: string) {
        this.languageId = languageId;
        this.debugType = debugType;
    }

    // check if executor can handle file 
    public canExecute(filePath: string): boolean {
        // for MVP: just check the extension 
        const ext = path.extname(filePath).toLowerCase();
        if (this.languageId === 'python' && (ext === '.py' || ext === '.pyw')) {
            return true;
        }
        if (this.languageId === 'javascript' && (ext === '.js' || ext === '.mjs')) {
            return true;
        }
        return false;

        // TODO later: can check if debugger is installed 
    }

    public getLanguageId(): string {
        return this.languageId;
    }

    public async execute(filePath: string): Promise<ExecutionTrace> {
        try {
            const debugConfig = this.createDebugConfig(filePath);
            this.valueTracker = new DebugValueTracker(filePath, this.languageId);

            // will hold session reference
            let capturedSession: vscode.DebugSession | undefined;

            // register listener before starting the debug, stores session when fired 
            const sessionListener = vscode.debug.onDidStartDebugSession((session) => {
                capturedSession = session;
            });

            this.disposables.push(sessionListener);

            // start debugging
            const started = await vscode.debug.startDebugging(undefined, debugConfig);
            if (!started) {
                throw new Error('Failed to start debug session');
            }

            if (!capturedSession) {
                sessionListener.dispose();
                throw new Error('Debug session was not captured');
            }

            this.currentSession = capturedSession;
            sessionListener.dispose();

            this.valueTracker?.startTracking(capturedSession);

            // for MVP: wait for session to end, then return collected trace
            // TODO later: implement a stepper 
            await new Promise(resolve => setTimeout(resolve, 100)); 
            await capturedSession.customRequest('continue'); 
            await this.waitForCompletion();

            const trace = this.valueTracker?.getTrace();
            if (!trace) {
                throw new Error('Failed to get execution trace');
            }

            return trace;
        } catch (err) {
            return {
                filePath,
                language: this.languageId,
                lineStates: new Map(),
                executionStart: new Date(),
                executionEnd: new Date(),
                success: false,
                error: String(err)
            };
        }
    }
    

    private createDebugConfig(filePath: string): vscode.DebugConfiguration {
        if (this.languageId === 'python') {
            return {
                type: this.debugType,       
                request: 'launch',
                name: 'Debug Python File',
                program: filePath,
                stopOnEntry: true,
                console: 'integratedTerminal',
                justMyCode: true
            };
        } else if (this.languageId === 'javascript') {
            return {
                type: this.debugType,       
                request: 'launch',
                name: 'Debug JavaScript File',
                program: filePath,
                stopOnEntry: true,
                console: 'integratedTerminal'
            };
        }
        
        throw new Error(`Unsupported language: ${this.languageId}`);
    }

    private async waitForCompletion(): Promise<void> {
        return new Promise<void>((resolve) => {
            const onDidTerminate = vscode.debug.onDidTerminateDebugSession((session) => {
                if (session.id === this.currentSession?.id) {
                    onDidTerminate.dispose();  
                    resolve();
                }
            });
            this.disposables.push(onDidTerminate);  
        });
    }

    public dispose(): void {
        if (this.currentSession) {
            vscode.debug.stopDebugging(this.currentSession);
            this.currentSession = undefined;
        }
        if (this.valueTracker) {
            this.valueTracker.dispose();
            this.valueTracker = undefined;
        }
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }

}

