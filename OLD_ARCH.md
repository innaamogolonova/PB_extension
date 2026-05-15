 Current High-Level Architecture (Simple)
[Developer in VS Code]
          |
          v
   [PB Extension]
          |
   +------+------+-------------------+
   |             |                   |
   v             v                   v
[Command]   [DebugExecutor]    [UI Providers]
(extension.ts)   |             (Annotations + Hover)
                 v
         [Debug Session / DAP]
                 |
                 v
         [DebugValueTracker]
                 |
                 v
            [ValueStore]
                 |
                 v
           [TraceManager]
                 |
                 v
      [Inline Hints / Hover Output]
                 |
                 v
         (Optional) [LLMFilterService]