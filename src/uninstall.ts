// Runs when VS Code uninstalls the extension ("vscode:uninstall"): removes the Claude skill OpenBuddy installed.

import { removeSkill } from "./skill";

removeSkill();
