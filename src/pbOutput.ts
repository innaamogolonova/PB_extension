import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function getPbOutputChannel(): vscode.OutputChannel {
    if (!channel) {
        channel = vscode.window.createOutputChannel('PB Extension');
    }
    return channel;
}

export function pbLog(message: string): void {
    const line = `[${new Date().toISOString()}] ${message}`;
    console.log(message);
    getPbOutputChannel().appendLine(line);
}
