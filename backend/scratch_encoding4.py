import io
from ofxparse import OfxParser

def test_ofx():
    bad_ofx = b"""OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>00000000000000
<LANGUAGE>POR
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1001
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>0237
<ACCTID>64641
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260423120000
<DTEND>20260423120000
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260401120000
<TRNAMT>116394,88
<FITID>N10112
<CHECKNUM>1037095
<MEMO>TRANSFERENCIA PIX REM: INSTITUTO DE GESTAO,  01/04
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260401120000
<TRNAMT>620740,07
<FITID>N10128
<CHECKNUM>1054438
<MEMO>TRANSFERENCIA PIX REM: INSTITUTO DE GESTAO,  01/04
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260401120000
<TRNAMT>180110,00
<FITID>N1013E
<CHECKNUM>1054447
<MEMO>TRANSFERENCIA PIX REM: INSTITUTO DE GESTAO,  01/04
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260401120000
<TRNAMT>-33021,66
<FITID>N10154
<CHECKNUM>53602
<MEMO>PAGTO ELETRON  COBRANCA API - BOLETOS OUTROS BANCOS
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
"""
    # Replace one character with a non-ascii one just to be sure
    bad_ofx = bad_ofx.replace(b"GESTAO", b"GEST\xc3\x83O")

    print("--- BytesIO ---")
    try:
        OfxParser.parse(io.BytesIO(bad_ofx))
        print("Success BytesIO")
    except Exception as e:
        print(f"Failed BytesIO: {e}")
        
    print("--- StringIO ---")
    try:
        text = bad_ofx.decode('utf-8')
        OfxParser.parse(io.StringIO(text))
        print("Success StringIO")
    except Exception as e:
        print(f"Failed StringIO: {e}")
        
    print("--- BytesIO with UTF-8 replacement ---")
    try:
        # What if we just replace ENCODING:USASCII with ENCODING:UTF-8 ?
        replaced_ofx = bad_ofx.replace(b"ENCODING:USASCII", b"ENCODING:UTF-8")
        OfxParser.parse(io.BytesIO(replaced_ofx))
        print("Success BytesIO Replacement")
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_ofx()
