const Agenda = require('agenda');
const Quiz = require('../models/Quiz'); 
const logger = require('../utils/logger');

module.exports = (mongoConnectionString) => {
  if (!mongoConnectionString) {
    throw new Error('❌ MONGODB_URI missing for Agenda');
  }

  const agenda = new Agenda({
    db: { address: mongoConnectionString, collection: 'agendaJobs' },
    processEvery: '30 seconds',
  });

  agenda.on('ready', async () => {
    console.log('✅ Agenda is ready');

    agenda.define('auto-submit overdue quizzes', async () => {
      const now = new Date();
      try {
        
        const quizzes = await Quiz.find({ timeLimitMinutes: { $ne: null } });

        for (const quiz of quizzes) {
          for (const submission of quiz.submissions) {
            if (submission.submitted_at) continue;

            const timeElapsed = (now.getTime() - submission.started_at.getTime()) / 60000; // minutes
            if (timeElapsed >= quiz.timeLimitMinutes) {
              submission.submitted_at = now;
              submission.auto_submitted = true;

              let score = 0;
              quiz.questions.forEach((q, index) => {
                if (submission.answers[index] === q.correct) score++;
              });
              submission.score = score;

              logger.info(
                `Auto-submitted quiz "${quiz.title}" for student ${submission.student_id}`
              );
            }
          }

          await quiz.save();
        }
      } catch (err) {
        logger.error('Error auto-submitting overdue quizzes:', err);
      }
    });

    await agenda.every('1 minute', 'auto-submit overdue quizzes');
    await agenda.start();
  });

  agenda.on('error', (err) => {
    console.error('❌ Agenda error:', err);
  });

  return agenda;
};
