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

## License

MIT