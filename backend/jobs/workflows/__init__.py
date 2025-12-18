"""
Inngest Workflows - One workflow per audit type
===============================================
Each workflow orchestrates the audit steps and calls FastAPI for data.
"""

from jobs.workflows.onboarding import onboarding_audit_function


__all__ = ["onboarding_audit_function"]
