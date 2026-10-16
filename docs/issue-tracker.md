# GitHub 规格与决策管理

本项目使用 [shuizhongyueming/canvas2d-webgl 的 GitHub Issues](https://github.com/shuizhongyueming/canvas2d-webgl/issues)，不使用本地 `.scratch` 作为 issue tracker。

- [Spec：Canvas2D WebGL 兼容画布 v0.1](https://github.com/shuizhongyueming/canvas2d-webgl/issues/1)：规格讨论和变更的管理入口；[仓库快照](specs/canvas2d-webgl.md)提供版本化内容。
- [Wayfinder：兼容画布规格与实施前决策地图](https://github.com/shuizhongyueming/canvas2d-webgl/issues/2)：只索引决策，不复制各票详情。
- 原始访谈见[设计记录](design/grill.md)。历史结论已经确认，不重新发起相同访谈。

## Wayfinding operations

通过 GitHub CLI（`gh`）管理。地图带 `wayfinder:map` 标签；子票只带对应的 `wayfinder:grilling`、`wayfinder:prototype`、`wayfinder:research` 或 `wayfinder:task` 标签，不标记为实现任务。

1. 先读取地图及其 GitHub sub-issues。未关闭、未指派且没有开放 blocker 的子票构成 frontier，按子票顺序推进。
2. 开始处理前将子票指派给推动项目的用户 `shuizhongyueming`，表示认领；不要认领尚未开展的票。
3. 通过 GitHub 原生 issue dependencies 记录阻塞关系。GitHub API 的 `issue_id` 和 `sub_issue_id` 使用数据库 ID，不是 issue 编号或 node ID。
4. 解决决策后在该票评论中记录结论和证据，关闭子票，再向地图 Decisions so far 添加带标题的链接和一句摘要。
5. 涉及规格的结论同步到 Spec issue 和仓库规格快照；记录日期、变更范围和对应决策链接。
6. 新出现的具体问题另建决策子票；尚不清晰的问题保留在地图 Not yet specified。地图不列一份重复的开放票清单。

本次建图没有授权继续实现渲染库。后续实施须依据用户进一步指令，另行拆解实现工作；本地图中的决策票不能当作默认编码授权。

## 实施工作管理

[开发计划：首版接口实现、分层测试与多 agent 并发交付](https://github.com/shuizhongyueming/canvas2d-webgl/issues/9)是独立实施入口，使用 `implementation:plan` / `implementation:task` 标签，不能把实施票贴成 wayfinder 决策票。延后平台票另加 `implementation:deferred`。

实施票同样使用 sub-issues 与原生 dependencies。依赖表示前置票已经合并；用户后续启动 agent 后，先认领并评论分支/工作目录，再用独立 worktree 工作。开放、无 blocker、无 assignee、非 deferred 才可领取。PR 合并、测试与本票需要的人工+AI评审齐备后才关闭；没有运行或仍待评审的票保持开放。

共同接口、文件归属、测试层次与完成门槛见[实施计划](plans/development.md)。已批准方案若被反例推翻，另建决策票作为受影响实施票的 blocker，不由实施 agent 自行改规格。本轮只创建开发计划，未执行任何实施票。
