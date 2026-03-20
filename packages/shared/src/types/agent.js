export var AgentType;
(function (AgentType) {
    AgentType["Claude"] = "claude";
    AgentType["ChatGPT"] = "chatgpt";
    AgentType["Gemini"] = "gemini";
    AgentType["Custom"] = "custom";
})(AgentType || (AgentType = {}));
export var AgentStatus;
(function (AgentStatus) {
    AgentStatus["Active"] = "active";
    AgentStatus["Suspended"] = "suspended";
    AgentStatus["Revoked"] = "revoked";
})(AgentStatus || (AgentStatus = {}));
export var PolicyType;
(function (PolicyType) {
    PolicyType["ItemScope"] = "item_scope";
    PolicyType["ActionPermission"] = "action_perm";
    PolicyType["RateLimit"] = "rate_limit";
    PolicyType["TimeWindow"] = "time_window";
    PolicyType["StepUp"] = "step_up";
})(PolicyType || (PolicyType = {}));
//# sourceMappingURL=agent.js.map