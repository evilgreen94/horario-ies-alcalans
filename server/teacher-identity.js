function normalizeDateKey(value) {
  const dateKey = value instanceof Date
    ? (Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10))
    : String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error('date must use YYYY-MM-DD format.');
  }
  const parsed = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateKey) {
    throw new Error('date must be a valid calendar date.');
  }
  return dateKey;
}

async function resolveActiveTeacherProfile(db, userId, date = new Date()) {
  const normalizedUserId = Number(userId);
  if (!Number.isSafeInteger(normalizedUserId) || normalizedUserId <= 0) {
    throw new Error('userId must be a positive integer.');
  }
  const dateKey = normalizeDateKey(date);
  const row = await db.get(
    `SELECT
       ta.id AS assignment_id,
       ta.assignment_type,
       ta.starts_on,
       ta.ends_on,
       ta.replaces_assignment_id,
       tp.id AS teacher_profile_id,
       tp.schedule_key,
       tp.display_name,
       ay.id AS academic_year_id,
       ay.code AS academic_year
     FROM teacher_assignments ta
     JOIN users u ON u.id = ta.user_id AND u.is_active = 1
     JOIN teacher_profiles tp ON tp.id = ta.teacher_profile_id AND tp.is_active = 1
     JOIN academic_years ay ON ay.id = ta.academic_year_id
     WHERE ta.user_id = ?
       AND ta.starts_on <= ?
       AND (ta.ends_on IS NULL OR ta.ends_on >= ?)
       AND ay.starts_on <= ?
       AND ay.ends_on >= ?
     ORDER BY
       CASE ta.assignment_type WHEN 'sustituto' THEN 0 ELSE 1 END,
       ta.starts_on DESC,
       ta.id DESC
     LIMIT 1`,
    [normalizedUserId, dateKey, dateKey, dateKey, dateKey]
  );

  if (!row) return null;
  return {
    userId: normalizedUserId,
    date: dateKey,
    assignment: {
      id: row.assignment_id,
      type: row.assignment_type,
      startsOn: row.starts_on,
      endsOn: row.ends_on || null,
      replacesAssignmentId: row.replaces_assignment_id || null
    },
    teacherProfile: {
      id: row.teacher_profile_id,
      academicYearId: row.academic_year_id,
      academicYear: row.academic_year,
      scheduleKey: row.schedule_key || null,
      displayName: row.display_name
    }
  };
}

module.exports = {
  normalizeDateKey,
  resolveActiveTeacherProfile
};
