# 接口变更演练与回滚沙盘

一个用于模拟和测试API接口变更的演练与回滚沙盘系统，支持接口版本管理、场景定义、失败注入、演练执行和回滚操作。

## 功能特性

### 核心功能
- **API版本管理** - 定义和管理不同版本的API接口
- **场景管理** - 创建演练场景并关联API版本
- **失败注入** - 模拟各种故障场景（网络延迟、错误响应、超时、数据损坏）
- **演练执行** - 执行演练并记录结果
- **快照管理** - 保存执行结果快照
- **回滚机制** - 基于快照进行回滚操作

### 失败链路保护
1. **运行中场景保护** - 运行中的场景不能被直接修改配置
2. **回滚权限验证** - 没有成功提交过的场景不能伪造回滚
3. **并发控制** - 同一版本被并发发起两次运行时后一次被阻塞或排队

### 持久化保障
- 快照、日志、归档状态、配置版本在重启后保持一致
- 支持导出场景执行摘要

### 场景包能力（v1.2.0 新增）
1. **完整导出** - 将场景的接口版本、字段映射、兼容策略、失败注入、执行历史摘要和最近一次可回滚快照导出为JSON
2. **智能导入** - 导入时自动检测冲突，支持覆盖、另存为、跳过等处理方式
3. **冲突拦截** - 同名场景、同版本号、缺字段、schema不兼容、已有运行记录等冲突都会被拦住
4. **导入撤销** - 可撤销最近一次导入，恢复导入前的状态
5. **变更追踪** - 所有导入、导出、冲突决策和撤销动作都记入日志

## 技术栈

- **后端**: Node.js + Express + SQLite
- **前端**: React + Axios
- **数据库**: SQLite（嵌入式，无需额外安装）

## 快速开始

### 环境要求
- Node.js >= 14.x
- npm >= 6.x

### 安装依赖

```bash
# 安装后端依赖
npm install

# 安装前端依赖
cd client
npm install
cd ..
```

### 构建前端

```bash
cd client
npm run build
cd ..
```

### 启动服务

```bash
npm start
```

服务启动后访问: http://localhost:3000

## 使用流程

### 流程一：成功演练链路

1. **创建API版本**
   - 进入「API版本管理」页面
   - 填写名称、版本号、基础路径
   - 点击「创建」

2. **创建演练场景**
   - 进入「场景管理」页面
   - 填写名称、描述，选择关联的API版本
   - 点击「创建」

3. **执行成功演练**
   - 进入「演练执行」页面
   - 选择创建的场景
   - 点击「执行演练」
   - 查看执行日志和结果，确认成功

4. **查看快照**
   - 进入「回滚管理」页面
   - 选择场景，查看快照历史

### 流程二：失败注入与回滚链路

1. **创建失败注入规则**
   - 进入「失败注入」页面
   - 选择目标场景
   - 选择注入类型（如：错误响应）
   - 设置触发概率为1.0（100%触发）
   - 配置错误响应参数：`{"statusCode": 500, "message": "模拟服务端错误"}`
   - 勾选「启用」并点击「创建」

2. **执行失败演练**
   - 进入「演练执行」页面
   - 选择配置了失败注入的场景
   - 点击「执行演练」
   - 查看执行日志，确认失败注入生效

3. **执行回滚**
   - 进入「回滚管理」页面
   - 选择场景
   - 点击「执行回滚」
   - 查看回滚结果，确认回滚成功

### 流程三：场景包导入导出

1. **导出场景包**
   - 进入「场景包」页面
   - 从下拉列表选择要导出的场景
   - 点击「导出场景包」按钮
   - 浏览器会自动下载JSON文件，包含：
     - 场景基本信息
     - 关联的API版本和Schema
     - 字段映射规则
     - 兼容策略配置
     - 失败注入规则
     - 执行历史摘要
     - 最近一次快照数据

2. **导入场景包**
   - 进入「场景包」页面
   - 点击「选择JSON文件」上传导出的场景包
   - 系统自动预览导入内容
   - 如有冲突，弹出冲突处理窗口
   - 选择处理方式（覆盖/另存为/跳过）
   - 点击「确认导入」完成导入

3. **处理导入冲突**
   - **同名场景冲突** - 可选择：覆盖现有场景 / 另存为新场景 / 跳过
   - **Schema不兼容** - 可选择：跳过API版本 / 强制创建
   - **已有运行记录** - 可选择：跳过执行历史 / 保留执行历史

4. **撤销导入**
   - 点击「撤销最近一次导入」按钮
   - 系统删除最近导入的场景
   - 导入记录仍然保留在日志中

## 失败注入类型

| 类型 | 说明 | 配置示例 |
|------|------|----------|
| network_delay | 网络延迟模拟 | `{"delay": 2000}` |
| error_response | 错误响应模拟 | `{"statusCode": 500, "message": "Server Error"}` |
| timeout | 超时模拟 | `{"timeout": 3000}` |
| data_corruption | 数据损坏模拟 | `{}` |

## API接口

### API版本管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/versions | 获取所有API版本 |
| GET | /api/versions/:id | 获取单个API版本 |
| POST | /api/versions | 创建API版本 |
| PUT | /api/versions/:id | 更新API版本 |
| DELETE | /api/versions/:id | 删除API版本 |

### 场景管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/scenarios | 获取所有场景 |
| GET | /api/scenarios/:id | 获取单个场景 |
| POST | /api/scenarios | 创建场景 |
| PUT | /api/scenarios/:id | 更新场景 |
| DELETE | /api/scenarios/:id | 删除场景 |

### 演练执行

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/executions/execute/:scenarioId | 执行演练 |
| GET | /api/executions | 获取所有执行记录 |
| GET | /api/executions/scenario/:scenarioId | 获取场景的执行记录 |

### 失败注入

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/injections | 创建失败注入规则 |
| GET | /api/injections/scenario/:scenarioId | 获取场景的注入规则 |
| PUT | /api/injections/:id | 更新注入规则 |
| DELETE | /api/injections/:id | 删除注入规则 |

### 回滚管理

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/rollback/:scenarioId | 执行回滚 |
| GET | /api/rollback/history/:scenarioId | 获取回滚历史 |
| GET | /api/rollback/export/:scenarioId | 导出场景摘要 |

### 场景包管理

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/scenario-packages/export/:scenarioId | 导出场景包 |
| POST | /api/scenario-packages/check-conflicts | 检测导入冲突 |
| POST | /api/scenario-packages/import | 导入场景包 |
| POST | /api/scenario-packages/import/preview | 预览导入 |
| GET | /api/scenario-packages/import-logs | 获取导入日志 |
| GET | /api/scenario-packages/import-logs/latest | 获取最近导入日志 |
| POST | /api/scenario-packages/rollback | 撤销最近导入 |
| GET | /api/scenario-packages/scenarios-with-history | 获取带历史的场景列表 |

## 项目结构

```
.
├── server/                    # 后端服务
│   ├── config.js             # 配置文件
│   ├── database.js           # 数据库连接
│   ├── index.js              # 入口文件
│   ├── dao/                  # 数据访问层
│   │   ├── apiVersionDao.js
│   │   ├── scenarioDao.js
│   │   ├── executionDao.js
│   │   ├── snapshotDao.js
│   │   └── failureInjectionDao.js
│   ├── routes/               # 路由层
│   │   ├── apiVersions.js
│   │   ├── scenarios.js
│   │   ├── executions.js
│   │   ├── rollback.js
│   │   └── failureInjections.js
│   └── services/             # 业务服务层
│       ├── executionEngine.js
│       ├── rollbackService.js
│       └── validationService.js
├── client/                   # 前端应用
│   ├── public/               # 静态资源
│   ├── src/
│   │   ├── api.js            # API调用封装
│   │   ├── components/       # React组件
│   │   │   ├── Header.js
│   │   │   ├── Navigation.js
│   │   │   ├── ApiVersionManager.js
│   │   │   ├── ScenarioManager.js
│   │   │   ├── FailureInjectionManager.js
│   │   │   ├── ExecutionPanel.js
│   │   │   └── RollbackManager.js
│   │   ├── App.js            # 主应用组件
│   │   └── index.js          # 入口文件
│   └── package.json
├── data/                     # 数据库文件（运行时自动创建）
└── README.md
```

## 验证测试

### 测试用例1：成功演练

1. 创建API版本：名称="用户服务"，版本="v2.0"，路径="/api/users"
2. 创建场景：名称="用户服务变更演练"，关联上述API版本
3. 执行演练，确认状态为"成功"
4. 确认快照已保存

### 测试用例2：失败注入

1. 为上述场景创建失败注入规则：类型="error_response"，概率=1.0，配置={"statusCode": 500}，启用
2. 执行演练，确认状态为"失败"
3. 查看日志确认错误注入生效

### 测试用例3：回滚操作

1. 对上述场景执行回滚
2. 确认回滚成功，场景状态变为"已回滚"
3. 验证快照数据已恢复

### 测试用例4：运行中场景保护

1. 执行一个长时间运行的演练（可配置网络延迟注入）
2. 在运行期间尝试修改场景配置
3. 确认返回错误："运行中的场景不能被直接修改配置"

### 测试用例5：未成功场景回滚保护

1. 创建新场景但不执行成功演练
2. 尝试执行回滚
3. 确认返回错误："没有成功提交过的场景不能伪造回滚"

### 测试用例6：并发控制

1. 同时发起两次相同场景的执行请求
2. 确认第二次请求被阻塞或排队

### 测试用例7：重启一致性

1. 创建场景并执行成功演练
2. 停止服务并重启
3. 确认场景、执行记录、快照数据完整保留

### 测试用例8：场景包导出

1. 创建API版本（带Schema）
2. 创建场景并关联API版本
3. 添加字段映射和失败注入
4. 进入「场景包」页面
5. 选择该场景并点击导出
6. 确认下载的JSON文件包含所有配置

### 测试用例9：场景包导入

1. 准备一个场景包JSON文件
2. 进入「场景包」页面
3. 上传JSON文件
4. 确认预览显示所有导入内容
5. 点击确认导入
6. 确认新场景创建成功

### 测试用例10：冲突检测

1. 导出某个场景
2. 重新导入同一场景包
3. 确认检测到同名冲突
4. 选择"另存为"处理方式
5. 确认新场景创建成功（带_imported_后缀）

### 测试用例11：导入撤销

1. 导入一个场景包
2. 记录新场景ID
3. 点击"撤销最近导入"
4. 确认该场景已被删除
5. 确认导入日志仍保留

## 修复记录

### v1.2.2 场景包导入闭环修复 (2026-06-16)

#### 修复的问题

1. **Schema不兼容时空decisions仍能导入**
   - **问题**: 检测到 schema 不兼容冲突后，空 `decisions: {}` 仍能继续导入，生成新场景和重复版本
   - **修复**: [scenarioPackages.js](file:///d:/workSpace/AI__SPACE/zyx-00112/server/routes/scenarioPackages.js#L47-L68) - 必须提供 `schema_incompatible: 'force_create'` 决策才能导入

2. **连续导入后撤销只删表面对象**
   - **问题**: 连续导入两次后，撤销只删除了场景，未删除同次导入创建的 API 版本、快照、执行历史等
   - **修复**: 
     - [scenarioPackageService.js](file:///d:/workSpace/AI__SPACE/zyx-00112/server/services/scenarioPackageService.js#L297-L302) - 导入时保存创建的资源ID
     - [scenarioPackageDao.js](file:///d:/workSpace/AI__SPACE/zyx-00112/server/dao/scenarioPackageDao.js#L5-L30) - 存储 imported_items
     - [scenarioPackageService.js](file:///d:/workSpace/AI__SPACE/zyx-00112/server/services/scenarioPackageService.js#L309-L408) - 撤销时精确删除导入创建的资源

3. **SQLite时间戳精度导致撤销顺序错误**
   - **问题**: SQLite 的 CURRENT_TIMESTAMP 精度只到秒，导致同一秒内的导入无法区分顺序
   - **修复**: [scenarioPackageDao.js](file:///d:/workSpace/AI__SPACE/zyx-00112/server/dao/scenarioPackageDao.js#L24) - 使用 rowid 排序确保正确顺序

#### 新增测试

- **场景包导入修复测试**: [scenario-import-fix.js](file:///d:/workSpace/AI__SPACE/zyx-00112/test/scenario-import-fix.js)
  - Test E: Schema不兼容时空decisions被拒绝
  - Test F: 连续导入后撤销只回退最近一次

#### 验证结果

- 原有回归测试: 10/10 通过
- 场景包回归测试: 4/4 通过
- 场景包导入修复测试: 2/2 通过

### v1.2.1 场景包链路修复 (2026-06-16)

#### 修复的问题

1. **导出动作未写日志**
   - **问题**: 导出场景包时没有记录到日志中
   - **修复**: [scenarioPackages.js](file:///d:/workSpace/AI__SPACE/zyx-00112/server/routes/scenarioPackages.js#L1-L20) - 导出后调用 `recordImport` 记录导出操作

2. **空decisions仍能导入**
   - **问题**: 同名场景冲突时，空 `decisions: {}` 对象也能通过导入
   - **修复**: [scenarioPackages.js](file:///d:/workSpace/AI__SPACE/zyx-00112/server/routes/scenarioPackages.js#L37-L50) - 只有提供 `duplicate_name` 决策才能导入同名场景

3. **导入后未恢复历史和快照**
   - **问题**: 导入场景时未恢复执行历史和快照数据
   - **修复**: [scenarioPackageService.js](file:///d:/workSpace/AI__SPACE/zyx-00112/server/services/scenarioPackageService.js#L252-L271) - 导入时根据决策恢复执行历史和快照

4. **撤销导入未清理关联资源**
   - **问题**: 撤销导入时只删除了场景，未删除关联的 API 版本、字段映射、失败注入等
   - **修复**: [scenarioPackageService.js](file:///d:/workSpace/AI__SPACE/zyx-00112/server/services/scenarioPackageService.js#L315-L370) - 撤销时清理所有关联资源

#### 新增测试

- **场景包回归测试**: [scenario-package-regression.js](file:///d:/workSpace/AI__SPACE/zyx-00112/test/scenario-package-regression.js)
  - Test A: 导出写日志
  - Test B: 空 decisions 被拒绝
  - Test C: 导入恢复历史和快照
  - Test D: 撤销清理关联资源

#### 验证结果

- 原有回归测试: 10/10 通过
- 场景包回归测试: 4/4 通过
- 重启后数据持久化: ✓ 验证通过（144条日志记录、50个场景完整保留）

### v1.2.0 场景包能力

#### 新增功能
1. **完整导出** - [scenarioPackageService.js](file:///d:/workSpace/AI__SPACE/zyx-00112/server/services/scenarioPackageService.js) 实现导出逻辑，将场景的接口版本、字段映射、兼容策略、失败注入、执行历史摘要和快照一起打包
2. **冲突检测** - [scenarioPackageService.js](file:///d:/workSpace/AI__SPACE/zyx-00112/server/services/scenarioPackageService.js) 的 `checkConflicts` 方法检测同名场景、同版本号、缺字段、schema不兼容、已有运行记录等冲突
3. **智能导入** - [scenarioPackageService.js](file:///d:/workSpace/AI__SPACE/zyx-00112/server/services/scenarioPackageService.js) 的 `importScenario` 方法支持覆盖、另存为、跳过等处理方式
4. **导入撤销** - [scenarioPackageService.js](file:///d:/workSpace/AI__SPACE/zyx-00112/server/services/scenarioPackageService.js) 的 `rollbackLastImport` 方法撤销最近一次导入
5. **变更追踪** - [scenarioPackageDao.js](file:///d:/workSpace/AI__SPACE/zyx-00112/server/dao/scenarioPackageDao.js) 中的 `importLogDao` 记录所有导入、导出、冲突决策和撤销动作

#### 数据库扩展
- 新增 `scenario_packages` 表 - 存储导入的包数据和关联关系
- 新增 `import_logs` 表 - 存储导入日志和决策

#### 前端组件
- 新增 [ScenarioPackageManager.js](file:///d:/workSpace/AI__SPACE/zyx-00112/client/src/components/ScenarioPackageManager.js) - 场景包管理界面

#### 回归测试
- Test 5: 场景包导出完整性
- Test 6: 场景包导入功能
- Test 7: 冲突检测
- Test 8: 冲突决策处理
- Test 9: 导入日志持久化
- Test 10: 导入撤销

**所有测试通过 (10/10)**

### v1.1.0 修复内容

#### 1. 字段映射和兼容策略补全
- **问题**: API版本只存储名称、版本、路径和schema，字段映射、兼容策略既没法定义也不会落库
- **修复**:
  - 新增 [fieldMappingDao.js](file:///d:/workSpace/AI__SPACE/zyx-00112/server/dao/fieldMappingDao.js) - 字段映射数据访问层
  - 新增 [compatibilityStrategyDao.js](file:///d:/workSpace/AI__SPACE/zyx-00112/server/dao/compatibilityStrategyDao.js) - 兼容策略数据访问层
  - 新增 [fieldMappings.js](file:///d:/workSpace/AI__SPACE/zyx-00112/server/routes/fieldMappings.js) - 字段映射API路由
  - 新增 [compatibilityStrategies.js](file:///d:/workSpace/AI__SPACE/zyx/00112/server/routes/compatibilityStrategies.js) - 兼容策略API路由
  - 更新 [apiVersions.js](file:///d:/workSpace/AI__SPACE/zyx-00112/server/routes/apiVersions.js) - 获取版本详情时返回关联的字段映射和兼容策略
- **验证**: 测试4验证了字段映射和兼容策略可创建、持久化并正确关联到API版本

#### 2. 失败注入校验增强
- **问题**: 失败注入缺少有效校验，非法配置会被写进去，读取时可能把服务打挂
- **修复**:
  - [failureInjectionDao.js](file:///d:/workSpace/AI__SPACE/zyx-00112/server/dao/failureInjectionDao.js) 新增完整的校验逻辑：
    - 写入前校验注入类型、必填字段、配置格式
    - 读取时使用 `_safeParseConfig` 方法兜底，脏数据不会导致崩溃
  - [executionEngine.js](file:///d:/workSpace/AI__SPACE/zyx-00112/server/services/executionEngine.js) 执行时添加兜底处理：
    - 使用 `safeConfig` 确保 config 始终是有效对象
    - 未知注入类型不会导致执行失败
  - [apiVersionDao.js](file:///d:/workSpace/AI__SPACE/zyx-00112/server/dao/apiVersionDao.js) JSON解析添加安全处理
- **验证**: 测试1验证了非法注入配置（无效类型、缺少必填字段、无效statusCode、无效JSON）被正确拒绝

### 回归测试

运行回归测试验证修复：

```bash
# 启动服务
npm start

# 运行测试（需要另开终端）
npm test
```

测试覆盖：
- Test 1: 非法注入配置被拒绝（4个子用例）
- Test 2: 合法配置可持久化
- Test 3: 回滚链路可用
- Test 4: 字段映射和兼容策略完整性

**所有测试通过 (4/4)**

### v1.2.0 场景包能力

#### 新增功能
1. **完整导出** - [scenarioPackageService.js](file:///d:/workSpace/AI__SPACE/zyx-00112/server/services/scenarioPackageService.js) 实现导出逻辑，将场景的接口版本、字段映射、兼容策略、失败注入、执行历史摘要和快照一起打包
2. **冲突检测** - [scenarioPackageService.js](file:///d:/workSpace/AI__SPACE/zyx-00112/server/services/scenarioPackageService.js) 的 `checkConflicts` 方法检测同名场景、同版本号、缺字段、schema不兼容、已有运行记录等冲突
3. **智能导入** - [scenarioPackageService.js](file:///d:/workSpace/AI__SPACE/zyx-00112/server/services/scenarioPackageService.js) 的 `importScenario` 方法支持覆盖、另存为、跳过等处理方式
4. **导入撤销** - [scenarioPackageService.js](file:///d:/workSpace/AI__SPACE/zyx-00112/server/services/scenarioPackageService.js) 的 `rollbackLastImport` 方法撤销最近一次导入
5. **变更追踪** - [scenarioPackageDao.js](file:///d:/workSpace/AI__SPACE/zyx-00112/server/dao/scenarioPackageDao.js) 中的 `importLogDao` 记录所有导入、导出、冲突决策和撤销动作

#### 数据库扩展
- 新增 `scenario_packages` 表 - 存储导入的包数据和关联关系
- 新增 `import_logs` 表 - 存储导入日志和决策

#### 前端组件
- 新增 [ScenarioPackageManager.js](file:///d:/workSpace/AI__SPACE/zyx-00112/client/src/components/ScenarioPackageManager.js) - 场景包管理界面

#### 回归测试
- Test 5: 场景包导出完整性
- Test 6: 场景包导入功能
- Test 7: 冲突检测
- Test 8: 冲突决策处理
- Test 9: 导入日志持久化
- Test 10: 导入撤销

**所有测试通过 (10/10)**

## License

MIT