import io
from ofxparse import OfxParser
import traceback

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
<MEMO>TRANSFERENCIA PIX REM: INSTITUTO DE GEST\xc3\x83O,  01/04
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
"""
    # Replace the text so we have a real e9 byte (latin-1)
    bad_ofx = bad_ofx.replace(b"GESTAO", b"GEST\xe9O")

    print("--- Testing what ofxparse does internally ---")
    try:
        text = bad_ofx.decode('latin-1')
        OfxParser.parse(io.StringIO(text))
        print("Success StringIO")
    except Exception as e:
        print("StringIO Exception:")
        traceback.print_exc()

if __name__ == "__main__":
    test_ofx()
