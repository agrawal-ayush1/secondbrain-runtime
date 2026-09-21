from simulator import initialize_simulator
from reservation_engine import ReservationEngine
from models import Prediction

def print_resource_state(resource_manager, resource_id: str):
    resource = resource_manager.get_resource(resource_id)
    if not resource:
        print(f"Resource '{resource_id}' not found.")
        return
    print(f"\n--- Resource State: {resource.name} ({resource.id}) ---")
    print(f"  Capacity  : {resource.capacity}")
    print(f"  Usage     : {resource.usage}")
    print(f"  Reserved  : {resource.reserved}")
    print(f"  Available : {resource.get_available()}")
    print("-" * 55)

def main():
    print("==================================================")
    print("  SecondBrain Resource Management Core Test")
    print("==================================================")
    
    # 1. Initialize simulated resources
    rm = initialize_simulator()
    engine = ReservationEngine(rm)
    
    flash_id = "gemini-2.5-flash"
    print("\n[Initial System Setup]")
    print_resource_state(rm, flash_id)

    # 2. Workflow 1 (W1) requests reservation on Gemini 2.5 Flash
    # Request: rpm=3, tpm=100000, rpd=1
    w1_prediction = Prediction(
        id="p1",
        workflow_id="workflow-1",
        resource_id=flash_id,
        requested_dimensions={"rpm": 3.0, "tpm": 100000.0, "rpd": 1.0}
    )
    
    print("\n[Action 1] Workflow 1 (W1) reserving Gemini 2.5 Flash (rpm=3, tpm=100000, rpd=1)...")
    w1_res = engine.evaluate_and_reserve(w1_prediction)
    if w1_res:
        print(f"-> SUCCESS: Reservation '{w1_res.id}' created for Workflow 1.")
    else:
        print("-> FAILED: Reservation denied for Workflow 1.")

    print_resource_state(rm, flash_id)

    # 3. Workflow 2 (W2) attempts to reserve Gemini 2.5 Flash
    # Request: rpm=3, tpm=100000, rpd=1
    # Note: Flash total rpm capacity is 5. 3 reserved + 3 requested = 6 > 5. Should be DENIED!
    w2_prediction = Prediction(
        id="p2",
        workflow_id="workflow-2",
        resource_id=flash_id,
        requested_dimensions={"rpm": 3.0, "tpm": 100000.0, "rpd": 1.0}
    )

    print("\n[Action 2] Workflow 2 (W2) requesting Gemini 2.5 Flash (rpm=3, tpm=100000, rpd=1)...")
    w2_res = engine.evaluate_and_reserve(w2_prediction)
    if w2_res:
        print(f"-> SUCCESS: Reservation '{w2_res.id}' created for Workflow 2.")
    else:
        print("-> DENIED: Reservation refused for Workflow 2 (Would exceed available capacity limits!).")

    print_resource_state(rm, flash_id)

    # 4. Consume W1's reservation (transition from Reserved -> Active Usage)
    if w1_res:
        print(f"\n[Action 3] Consuming Workflow 1's reservation ('{w1_res.id}')...")
        consumed = rm.consume(w1_res.id)
        print(f"-> Reservation Consumed: {consumed}")

    # 5. Show updated state after consumption
    print_resource_state(rm, flash_id)

if __name__ == "__main__":
    main()
