const Agenda = require('agenda');

module.exports = (mongoConnectionString) => {
  if (!mongoConnectionString) {
    throw new Error('❌ MONGODB_URI missing for Agenda');
  }

  const agenda = new Agenda({
    db: { address: mongoConnectionString, collection: 'agendaJobs' },
    processEvery: '30 seconds',
  });

  agenda.on('ready', () => {
    console.log('✅ Agenda is ready');
  });

  agenda.on('error', err => {
    console.error('❌ Agenda error:', err);
  });

  return agenda;
};