const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');

const apiVersionsRouter = require('./routes/apiVersions');
const scenariosRouter = require('./routes/scenarios');
const executionsRouter = require('./routes/executions');
const rollbackRouter = require('./routes/rollback');
const failureInjectionsRouter = require('./routes/failureInjections');
const fieldMappingsRouter = require('./routes/fieldMappings');
const compatibilityStrategiesRouter = require('./routes/compatibilityStrategies');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client/build')));

app.use('/api/versions', apiVersionsRouter);
app.use('/api/scenarios', scenariosRouter);
app.use('/api/executions', executionsRouter);
app.use('/api/rollback', rollbackRouter);
app.use('/api/injections', failureInjectionsRouter);
app.use('/api/field-mappings', fieldMappingsRouter);
app.use('/api/compatibility-strategies', compatibilityStrategiesRouter);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
});

app.listen(config.port, () => {
  console.log(`服务器运行在 http://localhost:${config.port}`);
});