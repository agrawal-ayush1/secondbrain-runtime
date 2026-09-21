from models import Resource
from resource_manager import ResourceManager

def initialize_simulator() -> ResourceManager:
    rm = ResourceManager()

    # Gemini 2.5 Flash
    rm.add_resource(Resource(
        id="gemini-2.5-flash",
        name="Gemini 2.5 Flash",
        type="llm",
        capacity={"rpm": 5.0, "tpm": 250000.0, "rpd": 20.0}
    ))

    # Gemini 2.5 Flash Lite
    rm.add_resource(Resource(
        id="gemini-2.5-flash-lite",
        name="Gemini 2.5 Flash Lite",
        type="llm",
        capacity={"rpm": 10.0, "tpm": 250000.0, "rpd": 20.0}
    ))

    # PostgreSQL Database
    rm.add_resource(Resource(
        id="postgres-db",
        name="PostgreSQL Database",
        type="database",
        capacity={"connections": 3.0}
    ))

    # Docker Worker
    rm.add_resource(Resource(
        id="docker-worker",
        name="Docker Worker",
        type="worker",
        capacity={"concurrent_jobs": 1.0}
    ))

    # PDF Generator Service
    rm.add_resource(Resource(
        id="pdf-generator",
        name="PDF Generator Service",
        type="service",
        capacity={"concurrent_jobs": 2.0}
    ))

    return rm
