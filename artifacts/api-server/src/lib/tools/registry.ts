export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  kind: "mcp" | "connector" | "builtin";
  capability: string;
  enabled: boolean;
}

export const TOOL_REGISTRY: ToolDefinition[] = [
  {
    id: "filesystem.list_dir",
    name: "Filesystem List Directory",
    description: "List files and folders inside the workspace.",
    kind: "mcp",
    capability: "workspace-file-access",
    enabled: true,
  },
  {
    id: "filesystem.read_file",
    name: "Filesystem Read File",
    description: "Read the contents of a workspace file.",
    kind: "mcp",
    capability: "workspace-file-access",
    enabled: true,
  },
  {
    id: "filesystem.write_file",
    name: "Filesystem Write File",
    description: "Write or update a file inside the workspace.",
    kind: "mcp",
    capability: "workspace-file-access",
    enabled: true,
  },
  {
    id: "memory.get",
    name: "Memory Get",
    description: "Retrieve a value from the swarm memory store.",
    kind: "builtin",
    capability: "memory-retrieval",
    enabled: true,
  },
  {
    id: "memory.set",
    name: "Memory Set",
    description: "Store a value in the swarm memory store.",
    kind: "builtin",
    capability: "memory-retrieval",
    enabled: true,
  },
  {
    id: "github.status",
    name: "GitHub Status",
    description: "Check whether GitHub access is configured for the swarm.",
    kind: "connector",
    capability: "repo-operations",
    enabled: true,
  },
  {
    id: "github.get_repo_info",
    name: "GitHub Get Repo Info",
    description: "Fetch repository metadata from GitHub.",
    kind: "connector",
    capability: "repo-operations",
    enabled: true,
  },
  {
    id: "github.list_issues",
    name: "GitHub List Issues",
    description: "List recent issues for the connected repository.",
    kind: "connector",
    capability: "repo-operations",
    enabled: true,
  },
  {
    id: "github.create_issue",
    name: "GitHub Create Issue",
    description: "Create a new issue in a GitHub repository.",
    kind: "connector",
    capability: "repo-operations",
    enabled: true,
  },
  {
    id: "connector-openrouter",
    name: "OpenRouter Connector",
    description: "Connects the swarm to OpenRouter model endpoints for richer completions.",
    kind: "connector",
    capability: "model-inference",
    enabled: true,
  },
  {
    id: "connector-nvidia",
    name: "NVIDIA Connector",
    description: "Connects the swarm to NVIDIA-hosted inference endpoints.",
    kind: "connector",
    capability: "model-inference",
    enabled: true,
  },
];

export function getEnabledTools() {
  return TOOL_REGISTRY.filter((tool) => tool.enabled);
}
