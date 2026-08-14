# Auto-split from app_celery_postgres_step4_login.py
# Section: CELERY TASK — RUN EEG PIPELINE OUTSIDE FLASK REQUEST PROCESS
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  CELERY TASK — RUN EEG PIPELINE OUTSIDE FLASK REQUEST PROCESS
# ══════════════════════════════════════════════════════════════════════════════
if celery_app is not None:
    @celery_app.task(name="process_eeg_job", bind=True)
    def process_eeg_job(self, job_id: str, filepath: str):
        """
        Production worker task.

        Flask only accepts the upload and queues this task. The heavy model
        pipeline runs in the Celery worker process. Per-segment events are
        written to PostgreSQL and Redis Streams by _put(), so the existing frontend
        /predictions/<jobId> SSE endpoint continues to work unchanged.
        """
        log.info(f"[celery] process_eeg_job started | job={job_id} task={self.request.id}")
        try:
            db_insert_audit(job_id, "celery", "task_started", {"taskId": self.request.id, "filepath": filepath})
            run_model(job_id, filepath)
            db_insert_audit(job_id, "celery", "task_finished", {"taskId": self.request.id})
            log.info(f"[celery] process_eeg_job finished | job={job_id} task={self.request.id}")
            return {"ok": True, "jobId": job_id}
        except Exception as exc:
            # run_model normally catches and publishes errors itself. This is a
            # final safety net for unexpected failures before run_model can emit.
            msg = f"Celery task failed: {type(exc).__name__}: {exc}"
            log.error(f"[celery] {msg}")
            log.error(traceback.format_exc())
            db_insert_audit(job_id, "celery", "task_failed", {"taskId": self.request.id, "error": msg})
            try:
                db_mark_stream_error(job_id, msg)
            except Exception:
                pass
            try:
                _put(job_id, {"type": "error", "message": msg, "code": "CELERY_TASK_FAILED"})
            except Exception:
                log.error(f"[celery] Could not publish task failure to stream for job={job_id}")
            return {"ok": False, "jobId": job_id, "error": msg}
else:
    process_eeg_job = None


