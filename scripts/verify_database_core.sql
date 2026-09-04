\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
    v_state_id UUID := '10000000-0000-4000-8000-000000000001';
    v_other_state_id UUID := '10000000-0000-4000-8000-000000000002';
    v_district_id UUID := '20000000-0000-4000-8000-000000000001';
    v_created_at TIMESTAMPTZ;
    v_updated_at_before TIMESTAMPTZ;
    v_updated_at_after TIMESTAMPTZ;
    v_data_type TEXT;
    v_is_nullable TEXT;
BEGIN
    IF to_regclass('public.states') IS NULL THEN
        RAISE EXCEPTION 'states table is missing';
    END IF;

    IF to_regclass('public.districts') IS NULL THEN
        RAISE EXCEPTION 'districts table is missing';
    END IF;

    IF to_regprocedure('public.nirikshanx_maintain_audit_timestamps()') IS NULL THEN
        RAISE EXCEPTION 'audit timestamp trigger function is missing';
    END IF;

    SELECT data_type, is_nullable
      INTO v_data_type, v_is_nullable
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'states'
       AND column_name = 'id';

    IF v_data_type IS DISTINCT FROM 'uuid' OR v_is_nullable IS DISTINCT FROM 'NO' THEN
        RAISE EXCEPTION 'states.id must be a NOT NULL UUID, got type=% nullable=%', v_data_type, v_is_nullable;
    END IF;

    SELECT data_type, is_nullable
      INTO v_data_type, v_is_nullable
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'districts'
       AND column_name = 'state_id';

    IF v_data_type IS DISTINCT FROM 'uuid' OR v_is_nullable IS DISTINCT FROM 'NO' THEN
        RAISE EXCEPTION 'districts.state_id must be a NOT NULL UUID, got type=% nullable=%', v_data_type, v_is_nullable;
    END IF;

    SELECT data_type, is_nullable
      INTO v_data_type, v_is_nullable
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'states'
       AND column_name = 'created_at';

    IF v_data_type IS DISTINCT FROM 'timestamp with time zone' OR v_is_nullable IS DISTINCT FROM 'NO' THEN
        RAISE EXCEPTION 'states.created_at must be NOT NULL timestamptz, got type=% nullable=%', v_data_type, v_is_nullable;
    END IF;

    IF to_regclass('public.uq_states_name_ci') IS NULL THEN
        RAISE EXCEPTION 'case-insensitive state-name uniqueness index is missing';
    END IF;

    IF to_regclass('public.uq_districts_state_name_ci') IS NULL THEN
        RAISE EXCEPTION 'case-insensitive district-name uniqueness index is missing';
    END IF;

    IF to_regclass('public.idx_districts_state_name') IS NULL THEN
        RAISE EXCEPTION 'district state/name lookup index is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_trigger
         WHERE tgname = 'trg_states_maintain_audit_timestamps'
           AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'states audit timestamp trigger is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_trigger
         WHERE tgname = 'trg_districts_maintain_audit_timestamps'
           AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'districts audit timestamp trigger is missing';
    END IF;

    INSERT INTO states (id, code, name)
    VALUES (v_state_id, 'TEST-ST', 'Core Test State')
    RETURNING created_at, updated_at
         INTO v_created_at, v_updated_at_before;

    INSERT INTO districts (id, state_id, code, name)
    VALUES (v_district_id, v_state_id, 'TEST-DT', 'Core Test District');

    PERFORM pg_sleep(0.02);

    UPDATE states
       SET name = 'Core Test State Updated'
     WHERE id = v_state_id
    RETURNING updated_at INTO v_updated_at_after;

    IF v_updated_at_after <= v_updated_at_before THEN
        RAISE EXCEPTION 'states.updated_at did not advance after update: before=% after=%', v_updated_at_before, v_updated_at_after;
    END IF;

    IF (SELECT created_at FROM states WHERE id = v_state_id) IS DISTINCT FROM v_created_at THEN
        RAISE EXCEPTION 'states.created_at changed during ordinary update';
    END IF;

    BEGIN
        UPDATE states
           SET created_at = clock_timestamp()
         WHERE id = v_state_id;
        RAISE EXCEPTION 'expected created_at immutability violation';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO states (id, code, name)
        VALUES (v_other_state_id, 'TEST-ST', 'Another State');
        RAISE EXCEPTION 'expected duplicate state code to be rejected';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO states (id, code, name)
        VALUES (v_other_state_id, ' test ', 'Invalid Code State');
        RAISE EXCEPTION 'expected malformed/padded state code to be rejected';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO states (id, code, name)
        VALUES (v_other_state_id, 'TEST-2', ' Padded State Name');
        RAISE EXCEPTION 'expected padded state name to be rejected';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO states (id, code, name)
        VALUES (v_other_state_id, 'TEST-2', 'core test state updated');
        RAISE EXCEPTION 'expected case-insensitive duplicate state name to be rejected';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO districts (id, state_id, code, name)
        VALUES (
            '20000000-0000-4000-8000-000000000002',
            '10000000-0000-4000-8000-999999999999',
            'TEST-MISSING',
            'Missing Parent District'
        );
        RAISE EXCEPTION 'expected missing parent state to be rejected';
    EXCEPTION
        WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO districts (id, state_id, code, name)
        VALUES (
            '20000000-0000-4000-8000-000000000003',
            v_state_id,
            'TEST-DT',
            'Duplicate Code District'
        );
        RAISE EXCEPTION 'expected duplicate district code to be rejected';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO districts (id, state_id, code, name)
        VALUES (
            '20000000-0000-4000-8000-000000000004',
            v_state_id,
            'TEST-DT-2',
            'core test district'
        );
        RAISE EXCEPTION 'expected case-insensitive duplicate district name within a state to be rejected';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    BEGIN
        DELETE FROM states WHERE id = v_state_id;
        RAISE EXCEPTION 'expected referenced state deletion to be restricted';
    EXCEPTION
        WHEN foreign_key_violation THEN NULL;
    END;

    RAISE NOTICE 'Database-core schema and constraint verification passed.';
END;
$$;

ROLLBACK;
