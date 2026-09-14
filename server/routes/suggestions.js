const express = require('express');
const { getDatabase } = require('../db');
const { requireAuthenticated } = require('../session');
const { requireSameOriginWrite } = require('./profesorado/shared');
const {
  createSuggestion,
  getSuggestion,
  listOwnSuggestions,
  listSuggestions,
  reviewSuggestion
} = require('../suggestion-service');

const router = express.Router();

function hasRole(req, role) {
  return Array.isArray(req.sessionUser?.roles) && req.sessionUser.roles.includes(role);
}

function canReview(req) {
  return hasRole(req, 'admin') || hasRole(req, 'superadmin');
}

function requireTeacher(req, res, next) {
  if (hasRole(req, 'teacher')) return next();
  return res.status(403).json({ error: 'Solo el profesorado puede crear sugerencias.' });
}

function requireReviewer(req, res, next) {
  if (canReview(req)) return next();
  return res.status(403).json({ error: 'Permisos insuficientes.' });
}

router.post('/', requireAuthenticated, requireTeacher, requireSameOriginWrite, async (req, res, next) => {
  try {
    const suggestion = await createSuggestion(await getDatabase(), req.body, req.sessionUser.userId);
    res.status(201).json({ suggestion });
  } catch (error) { next(error); }
});

router.get('/me', requireAuthenticated, async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ suggestions: await listOwnSuggestions(await getDatabase(), req.sessionUser.userId) });
  } catch (error) { next(error); }
});

router.get('/', requireAuthenticated, requireReviewer, async (req, res, next) => {
  try {
    if (req.query.status !== undefined && typeof req.query.status !== 'string') {
      return res.status(400).json({ error: 'status debe ser un único valor.' });
    }
    if (req.query.q !== undefined && typeof req.query.q !== 'string') {
      return res.status(400).json({ error: 'q debe ser un único valor.' });
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({ suggestions: await listSuggestions(await getDatabase(), {
      status: req.query.status || '', query: req.query.q || ''
    }) });
  } catch (error) { next(error); }
});

router.get('/:id', requireAuthenticated, async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ suggestion: await getSuggestion(
      await getDatabase(), req.params.id, req.sessionUser.userId, canReview(req)
    ) });
  } catch (error) { next(error); }
});

router.patch('/:id', requireAuthenticated, requireReviewer, requireSameOriginWrite, async (req, res, next) => {
  try {
    res.json({ suggestion: await reviewSuggestion(
      await getDatabase(), req.params.id, req.body, req.sessionUser.userId
    ) });
  } catch (error) { next(error); }
});

module.exports = router;
