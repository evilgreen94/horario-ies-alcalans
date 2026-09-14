const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'guardias.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'js', 'app', 'guardias-suggestions.js'), 'utf8');
const appIndex = fs.readFileSync(path.join(root, 'app', 'index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'app', 'app.js'), 'utf8');

module.exports = [
  {
    name: 'suggestions UI lives in guardias with teacher own list and one shared reviewer panel',
    fn() {
      for (const id of [
        'suggestionsOverlay', 'suggestionForm', 'suggestionTitle', 'suggestionDescription',
        'suggestionCategory', 'ownSuggestionsList', 'suggestionsReviewSection', 'reviewSuggestionsList'
      ]) {
        assert.ok(html.includes(`id="${id}"`), id);
      }
      assert.ok(html.includes('js/app/guardias-suggestions.js'));
      assert.ok((html.match(/onclick="openSuggestionsModal\(\)"/g) || []).length >= 3);
      assert.ok(html.includes('Mis sugerencias'));
    }
  },
  {
    name: 'suggestions UI uses session roles, humanized states and text-only rendering',
    fn() {
      for (const label of ['Nueva', 'En revisión', 'Aceptada', 'Planificada', 'Implementada', 'Descartada', 'Duplicada']) {
        assert.ok(source.includes(label), label);
      }
      assert.match(source, /const teacher=roles\.includes\('teacher'\)/);
      assert.match(source, /const reviewer=roles\.includes\('admin'\)\|\|roles\.includes\('superadmin'\)/);
      assert.match(source, /suggestionsTeacherSection'\)\.hidden=!teacher/);
      assert.match(source, /suggestionsReviewSection'\)\.hidden=!reviewer/);
      assert.ok(source.includes('node.textContent=text'));
      assert.ok(source.includes('list.replaceChildren()'));
      assert.ok(!source.includes('.innerHTML='));
      assert.ok(source.includes('Implementada en ${item.implementedVersion}'));
    }
  },
  {
    name: 'suggestions do not change app mobile files or add device routing',
    fn() {
      assert.ok(!appIndex.toLowerCase().includes('suggestion'));
      assert.ok(!appSource.toLowerCase().includes('suggestion'));
      assert.ok(!source.includes('/app/'));
      assert.ok(!/userAgent|matchMedia|location\.replace|location\.assign/i.test(source));
    }
  }
];
