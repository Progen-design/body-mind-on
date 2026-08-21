/**
 * POST /api/onboarding/generate-plan
 * Týdenní plán přes stejnou cestu jako zbytek produktu: OpenAI → Spoonacular → wger,
 * structured validace, HTML render (volitelně pro klienta).
 * @see docs/ONBOARDING_PRODUCTION_SPEC.md
 */
import { runUnifiedPlanPipeline } from '../../../lib/unifiedPlanPipeline';
import { validateBodyMetrics } from '../../../lib/validation/onboardingSchema';

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function errorResponse(res, status, error, code, details = null, reqId = null) {
  return res.status(status).json({
    ok: false,
    error,
    code: code || 'INTERNAL_ERROR',
    details,
    _request_id: reqId || uuidv4(),
  });
}

export default async function handler(req, res) {
  const requestId = uuidv4();
  res.setHeader?.('x-request-id', requestId);

  if (req.method !== 'POST') {
    return errorResponse(res, 405, 'Pouze POST', 'METHOD_NOT_ALLOWED', null, requestId);
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { user_id, body_metrics } = body;

    const validation = validateBodyMetrics(body_metrics);
    if (!validation.ok) {
      return errorResponse(res, 400, validation.error, 'VALIDATION_ERROR', validation.details, requestId);
    }

    const bm = { ...body_metrics, ...(user_id ? { user_id } : {}) };

    const pipeline = await runUnifiedPlanPipeline({
      bm,
      useOpenAI: true,
      requestId,
    });

    if (!pipeline?.ok) {
      const isPlanValidation = pipeline?.validation?.hardFail === true;
      const status = isPlanValidation ? 422 : 500;
      const code = isPlanValidation ? 'PLAN_VALIDATION_ERROR' : 'INTERNAL_ERROR';
      return errorResponse(
        res,
        status,
        pipeline.error ?? 'Nepodařilo se vygenerovat plán',
        code,
        {
          validation: pipeline.validation ?? null,
          diagnostics: pipeline._diagnostics ?? null,
        },
        requestId
      );
    }

    const pj = pipeline.planJson;
    return res.status(200).json({
      ...pj,
      plan_html: pipeline.planHtml,
      _validation: pipeline.validation ?? null,
    });
  } catch (err) {
    console.error('[onboarding/generate-plan]', err?.message || err, { requestId });

    const isValidation = err?.message?.includes('JSON') || err?.name === 'SyntaxError';
    if (isValidation) {
      return errorResponse(res, 400, 'Neplatný JSON v těle požadavku', 'VALIDATION_ERROR', null, requestId);
    }

    return errorResponse(
      res,
      500,
      'Nepodařilo se vygenerovat plán',
      'INTERNAL_ERROR',
      process.env.NODE_ENV === 'development' ? { message: err?.message } : null,
      requestId
    );
  }
}
